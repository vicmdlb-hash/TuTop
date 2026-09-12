const command = String(process.argv[2] || 'unknown');
console.error(`DETENIDO: ${command} está bloqueado durante TuTop 0.9 Runtime Freeze Candidate.`);
console.error('Usa únicamente la cadena exact-SHA: October → staging-v2-smoke → Android → Physical QA.');
process.exit(2);
