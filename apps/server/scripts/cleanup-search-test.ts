import db from '../src/db/db.js';

// Remove negócios importados por fontes de teste (mantém apenas 'seed' e 'manual')
const result = db.prepare("DELETE FROM businesses WHERE source IN ('osm', 'google')").run();
console.log('removidos:', Number(result.changes));
