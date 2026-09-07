import fs from 'node:fs';
import assert from 'node:assert/strict';

const inbox = fs.readFileSync('src/components/Inbox.tsx', 'utf8');
assert.match(inbox, /type InboxFilter = 'Todos' \| 'Compras' \| 'Ventas' \| 'Pendientes'/);
assert.match(inbox, /filter === 'Pendientes' && chat\.vendedor_id === user\.id && \(chat\.sin_leer \|\| 0\) > 0/);
assert.match(inbox, /setFilter\('Pendientes'\)/);
assert.match(inbox, /No tienes ventas pendientes de respuesta/);
console.log('PASS inbox pending card filters only unread seller conversations');
console.log('Inbox pending filter contract: PASS');
