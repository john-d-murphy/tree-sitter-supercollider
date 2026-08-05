const Parser = require('tree-sitter');
const SuperCollider = require('./');

const parser = new Parser();
parser.setLanguage(SuperCollider);

const src = `MyClass {
    *new { ^super.new }
}`;

const tree = parser.parse(src);
const starPos = src.indexOf('*');

console.log('Star position:', starPos);
console.log('Character:', src[starPos]);

const node = tree.rootNode.descendantForPosition({row: 1, column: 4});
console.log('\nNode at star position:');
console.log('  kind:', node.type);
console.log('  text:', src.substring(node.startIndex, node.endIndex));
console.log('  parent:', node.parent?.type);
console.log('  parent.parent:', node.parent?.parent?.type);

let cur = node;
let depth = 0;
while (cur) {
    console.log(`  ${'  '.repeat(depth)}${cur.type} [${cur.startIndex}-${cur.endIndex}]`);
    cur = cur.parent;
    depth++;
}
