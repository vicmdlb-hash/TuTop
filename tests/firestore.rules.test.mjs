import fs from 'node:fs';
import test, { after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, writeBatch, Timestamp } from 'firebase/firestore';

const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || 'demo-tutop-rules-test';
const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [hostname, portRaw] = host.split(':');
const rules = fs.readFileSync('firebase/firestore.rules', 'utf8');
const env = await initializeTestEnvironment({ projectId, firestore: { host: hostname, port: Number(portRaw || 8080), rules } });

after(async () => env.cleanup());
beforeEach(async () => env.clearFirestore());

const now = () => Timestamp.now();
const image = 'data:image/webp;base64,UklGRg==';

async function seedBase() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/u1'), { uid: 'u1', nombre: 'Uno', facultad: 'Turismo Internacional', esta_verificado: false, created_at: now(), updated_at: now() });
    await setDoc(doc(db, 'users/u2'), { uid: 'u2', nombre: 'Dos', facultad: 'Turismo Internacional', esta_verificado: false, created_at: now(), updated_at: now() });
    await setDoc(doc(db, 'wallets/u1'), { owner_uid: 'u1', balance: 10, prestige: 0, welcome_granted: true, last_op_id: 'welcome-u1', updated_at: now() });
    await setDoc(doc(db, 'products/p-u1'), { vendedor_id:'u1', vendedor_nombre:'Uno', vendedor_handle:'@uno', titulo:'Brownies', descripcion:'Caja de brownies', precio_mxn:25, categoria:'Postres', facultad:'Turismo Internacional', punto_encuentro:'Cafetería Central', imagen_url:image, estado:'Activo', likes:0, fecha_creacion:now(), updated_at:now() });
    await setDoc(doc(db, 'products/p-u2'), { vendedor_id:'u2', vendedor_nombre:'Dos', vendedor_handle:'@dos', titulo:'Apuntes', descripcion:'Guía de estudio', precio_mxn:50, categoria:'Apuntes & Guías', facultad:'Turismo Internacional', punto_encuentro:'Puerta Principal', imagen_url:image, estado:'Activo', likes:0, fecha_creacion:now(), updated_at:now() });
  });
}

test('perfiles públicos sólo requieren sesión; teléfono privado sólo propietario/admin', async () => {
  await seedBase();
  const u1 = env.authenticatedContext('u1').firestore();
  const u2 = env.authenticatedContext('u2').firestore();
  const guest = env.unauthenticatedContext().firestore();
  await env.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(),'user_private/u1'), { uid:'u1', telefono:'+522461234567', created_at:now(), auth_mode:'phone_password_beta' }));
  await assertSucceeds(getDoc(doc(u2, 'users/u1')));
  await assertFails(getDoc(doc(guest, 'users/u1')));
  await assertSucceeds(getDoc(doc(u1, 'user_private/u1')));
  await assertFails(getDoc(doc(u2, 'user_private/u1')));
});

test('bootstrap de cuenta exige wallet y transacción bienvenida atómicas', async () => {
  const db = env.authenticatedContext('new-user').firestore();
  const batch = writeBatch(db);
  batch.set(doc(db,'users/new-user'), { uid:'new-user', nombre:'Nuevo', facultad:'Turismo Internacional', esta_verificado:false, created_at:now(), updated_at:now() });
  batch.set(doc(db,'user_private/new-user'), { uid:'new-user', telefono:'+522461234567', created_at:now(), auth_mode:'phone_password_beta' });
  batch.set(doc(db,'wallets/new-user'), { owner_uid:'new-user', balance:10, prestige:0, welcome_granted:true, last_op_id:'welcome-new-user', updated_at:now() });
  batch.set(doc(db,'wallet_transactions/welcome-new-user'), { user_id:'new-user', type:'income', description:'Bono de bienvenida', amount:10, operation_id:'welcome-new-user', created_at:now() });
  await assertSucceeds(batch.commit());
});

test('no se puede fabricar una wallet inicial sin su ledger', async () => {
  const db = env.authenticatedContext('evil').firestore();
  await assertFails(setDoc(doc(db,'wallets/evil'), { owner_uid:'evil', balance:10, prestige:0, welcome_granted:true, last_op_id:'welcome-evil', updated_at:now() }));
});

test('producto válido se crea; update inválido de precio/categoría se bloquea', async () => {
  await seedBase();
  const db = env.authenticatedContext('u1').firestore();
  await assertSucceeds(setDoc(doc(db,'products/new-product'), { vendedor_id:'u1', vendedor_nombre:'Uno', vendedor_handle:'@uno', titulo:'Sudadera', descripcion:'Talla M', precio_mxn:450, categoria:'Ropa & Accesorios', facultad:'Turismo Internacional', punto_encuentro:'Coordinar por Chat', imagen_url:image, estado:'Activo', likes:0, fecha_creacion:now(), updated_at:now() }));
  await assertFails(updateDoc(doc(db,'products/p-u1'), { precio_mxn:-10, updated_at:now() }));
  await assertFails(updateDoc(doc(db,'products/p-u1'), { categoria:'Crypto', updated_at:now() }));
});

test('producto no puede falsificar nombre ni facultad del vendedor', async () => {
  await seedBase();
  const db = env.authenticatedContext('u1').firestore();
  const base = { vendedor_id:'u1', vendedor_nombre:'Uno', vendedor_handle:'@uno', titulo:'Sudadera', descripcion:'Talla M', precio_mxn:450, categoria:'Ropa & Accesorios', facultad:'Turismo Internacional', punto_encuentro:'Coordinar por Chat', imagen_url:image, estado:'Activo', likes:0, fecha_creacion:now(), updated_at:now() };
  await assertFails(setDoc(doc(db,'products/fake-name'), { ...base, vendedor_nombre:'Otra Persona' }));
  await assertFails(setDoc(doc(db,'products/fake-faculty'), { ...base, facultad:'Derecho' }));
});

test('chat sólo lo inicia comprador contra producto activo y mensajes sólo participantes', async () => {
  await seedBase();
  const u1 = env.authenticatedContext('u1').firestore();
  const u3 = env.authenticatedContext('u3').firestore();
  await assertSucceeds(setDoc(doc(u1,'chats/chat-u1-p-u2'), { product_id:'p-u2', producto_id:'p-u2', buyer_id:'u1', comprador_id:'u1', seller_id:'u2', vendedor_id:'u2', participants:['u1','u2'], nombre_otro_usuario:'Dos', created_at:now(), updated_at:now(), last_message:'', last_message_at:now() }));
  await assertSucceeds(setDoc(doc(u1,'chats/chat-u1-p-u2/messages/m1'), { sender_id:'u1', text:'¿Sigue disponible?', created_at:now() }));
  await assertFails(setDoc(doc(u3,'chats/chat-u1-p-u2/messages/m2'), { sender_id:'u3', text:'intrusión', created_at:now() }));
});

test('puja válida descuenta wallet, suma prestigio y exige bid+ledger en mismo batch', async () => {
  await seedBase();
  const db = env.authenticatedContext('u1').firestore();
  const op='bid-test-1';
  const batch=writeBatch(db);
  batch.update(doc(db,'wallets/u1'), { balance:5, prestige:5, last_op_id:op, updated_at:now() });
  batch.set(doc(db,`bids/${op}`), { uid:'u1', product_id:'p-u1', facultad:'Turismo Internacional', categoria:'Postres', amount:5, week_id:'2026-W36', created_at:now() });
  batch.set(doc(db,`wallet_transactions/${op}`), { user_id:'u1', type:'expense', description:'Puja semanal', amount:-5, operation_id:op, created_at:now() });
  await assertSucceeds(batch.commit());
  await assertFails(updateDoc(doc(db,'wallets/u1'), { balance:4, prestige:99, last_op_id:'fake', updated_at:now() }));
});



test('chat no permite autochat ni ids arbitrarios', async () => {
  await seedBase();
  const u1 = env.authenticatedContext('u1').firestore();
  const base = { product_id:'p-u2', producto_id:'p-u2', buyer_id:'u1', comprador_id:'u1', seller_id:'u2', vendedor_id:'u2', participants:['u1','u2'], nombre_otro_usuario:'Dos', created_at:now(), updated_at:now(), last_message:'', last_message_at:now() };
  await assertFails(setDoc(doc(u1,'chats/cualquiera'), base));
  await assertFails(setDoc(doc(u1,'chats/chat-u1-p-u1'), { ...base, product_id:'p-u1', producto_id:'p-u1', seller_id:'u1', vendedor_id:'u1', participants:['u1','u1'] }));
});

test('puja rechaza categoría o facultad falsificadas', async () => {
  await seedBase();
  const db = env.authenticatedContext('u1').firestore();
  const op='bid-bad-meta';
  const batch=writeBatch(db);
  batch.update(doc(db,'wallets/u1'), { balance:5, prestige:5, last_op_id:op, updated_at:now() });
  batch.set(doc(db,`bids/${op}`), { uid:'u1', product_id:'p-u1', facultad:'Otra Facultad', categoria:'Servicios', amount:5, week_id:'2026-W36', created_at:now() });
  batch.set(doc(db,`wallet_transactions/${op}`), { user_id:'u1', type:'expense', description:'Puja semanal', amount:-5, operation_id:op, created_at:now() });
  await assertFails(batch.commit());
});

test('reportes validan objetivo y pertenencia', async () => {
  await seedBase();
  const u1 = env.authenticatedContext('u1').firestore();
  await assertSucceeds(setDoc(doc(u1,'reports/r-product'), { created_by:'u1', target_type:'product', target_id:'p-u2', reason:'Contenido engañoso', status:'open', created_at:now(), updated_at:now() }));
  await assertFails(setDoc(doc(u1,'reports/r-own'), { created_by:'u1', target_type:'product', target_id:'p-u1', reason:'Mi propio producto', status:'open', created_at:now(), updated_at:now() }));
  await assertFails(setDoc(doc(u1,'reports/r-missing'), { created_by:'u1', target_type:'user', target_id:'u404', reason:'No existe', status:'open', created_at:now(), updated_at:now() }));
});

test('verificación aprobada no puede volver a pending por el usuario', async () => {
  await seedBase();
  await env.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(),'verificationRequests/u1'), { uid:'u1', status:'approved', image_data:image, created_at:now(), updated_at:now() }));
  const u1 = env.authenticatedContext('u1').firestore();
  await assertFails(updateDoc(doc(u1,'verificationRequests/u1'), { status:'pending', image_data:image, updated_at:now() }));
});

test('usuario normal no puede autoverificarse ni crearse admin', async () => {
  await seedBase();
  const db = env.authenticatedContext('u1').firestore();
  await assertFails(setDoc(doc(db,'publicVerifications/u1'), { approved:true, updated_at:now(), reviewed_by:'u1' }));
  await assertFails(setDoc(doc(db,'admins/u1'), { active:true }));
});

test('admin sembrado manualmente puede moderar y revisar verificación', async () => {
  await seedBase();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db=ctx.firestore();
    await setDoc(doc(db,'admins/admin'), { active:true });
    await setDoc(doc(db,'verificationRequests/u1'), { uid:'u1', status:'pending', image_data:image, created_at:now(), updated_at:now() });
  });
  const db = env.authenticatedContext('admin').firestore();
  await assertSucceeds(updateDoc(doc(db,'verificationRequests/u1'), { status:'approved', updated_at:now() }));
  await assertSucceeds(setDoc(doc(db,'publicVerifications/u1'), { approved:true, updated_at:now(), reviewed_by:'admin' }));
  await assertSucceeds(setDoc(doc(db,'moderationStatus/u2'), { suspended:true, reason:'prueba', updated_at:now(), admin_uid:'admin' }));
});


test('catálogo canónico puede sembrarse una sola vez y no admite valores arbitrarios', async () => {
  const db = env.authenticatedContext('u1').firestore();
  await seedBase();
  await assertSucceeds(setDoc(doc(db,'catalog/marketplace'), {
    version: 1,
    categories: ['Electrónica','Ropa & Accesorios','Libros & Apuntes','Comida','Postres','Servicios','Transporte','Cuartos & Renta','Eventos','Arte & Manualidades','Otros'],
    meeting_points: ['Cafetería Central','Puerta Principal','Salón de Clases','Coordinar por Chat'],
    updated_at: now(),
  }));
  await assertFails(updateDoc(doc(db,'catalog/marketplace'), { version: 2, updated_at: now() }));
});

test('producto admite hasta cuatro imágenes válidas y conserva la portada como primera imagen', async () => {
  await seedBase();
  const db = env.authenticatedContext('u1').firestore();
  await assertSucceeds(setDoc(doc(db,'products/multi-photo'), {
    vendedor_id:'u1', vendedor_nombre:'Uno', vendedor_handle:'@uno', titulo:'Calculadora', descripcion:'Calculadora científica funcionando', precio_mxn:300,
    categoria:'Electrónica', facultad:'Turismo Internacional', punto_encuentro:'Cafetería Central', imagen_url:image, imagenes_url:[image,image], estado:'Activo', likes:0,
    fecha_creacion:now(), updated_at:now()
  }));
  await assertFails(setDoc(doc(db,'products/bad-photos'), {
    vendedor_id:'u1', vendedor_nombre:'Uno', vendedor_handle:'@uno', titulo:'Calculadora', descripcion:'Calculadora científica funcionando', precio_mxn:300,
    categoria:'Electrónica', facultad:'Turismo Internacional', punto_encuentro:'Cafetería Central', imagen_url:image, imagenes_url:['https://example.com/not-allowed.jpg'], estado:'Activo', likes:0,
    fecha_creacion:now(), updated_at:now()
  }));
});

test('chat permite foto comprimida como mensaje y bloquea urls externas', async () => {
  await seedBase();
  const db = env.authenticatedContext('u1').firestore();
  await setDoc(doc(db,'chats/chat-u1-p-u2'), { product_id:'p-u2', producto_id:'p-u2', buyer_id:'u1', comprador_id:'u1', seller_id:'u2', vendedor_id:'u2', participants:['u1','u2'], nombre_otro_usuario:'Dos', created_at:now(), updated_at:now(), last_message:'', last_message_at:now() });
  await assertSucceeds(setDoc(doc(db,'chats/chat-u1-p-u2/messages/photo-ok'), { sender_id:'u1', text:'', image_url:image, created_at:now() }));
  await assertFails(setDoc(doc(db,'chats/chat-u1-p-u2/messages/photo-bad'), { sender_id:'u1', text:'', image_url:'https://example.com/x.jpg', created_at:now() }));
});
