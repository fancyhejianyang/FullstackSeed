const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const sourceRoot = path.resolve(__dirname, '..', 'src');
const safePrimitiveKinds = new Set([
  ts.SyntaxKind.StringKeyword,
  ts.SyntaxKind.NumberKeyword,
  ts.SyntaxKind.BooleanKeyword,
]);

function collectEntityFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectEntityFiles(entryPath);
    return entry.name.endsWith('.entity.ts') ? [entryPath] : [];
  });
}

function getDecorators(node) {
  return ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
}

function getDecoratorCall(node, decoratorName) {
  for (const decorator of getDecorators(node)) {
    const expression = decorator.expression;
    if (!ts.isCallExpression(expression)) continue;
    const callee = expression.expression;
    const name = ts.isIdentifier(callee)
      ? callee.text
      : ts.isPropertyAccessExpression(callee)
        ? callee.name.text
        : '';
    if (name === decoratorName) return expression;
  }
  return null;
}

function hasExplicitColumnType(columnCall) {
  const [firstArgument] = columnCall.arguments;
  if (!firstArgument) return false;
  if (ts.isStringLiteral(firstArgument)) return true;
  if (!ts.isObjectLiteralExpression(firstArgument)) return true;
  return firstArgument.properties.some(
    (property) =>
      ts.isPropertyAssignment(property) && property.name.getText() === 'type',
  );
}

function isNullishType(typeNode) {
  return (
    typeNode.kind === ts.SyntaxKind.NullKeyword ||
    typeNode.kind === ts.SyntaxKind.UndefinedKeyword
  );
}

/**
 * TypeORM relies on emitDecoratorMetadata when `@Column` does not provide a
 * type. Union and object-like TypeScript types commonly emit `Object`, which
 * MySQL cannot map to a column type.
 */
function needsExplicitColumnType(typeNode) {
  if (!typeNode || safePrimitiveKinds.has(typeNode.kind)) return false;

  if (ts.isParenthesizedTypeNode(typeNode)) {
    return needsExplicitColumnType(typeNode.type);
  }

  if (ts.isUnionTypeNode(typeNode)) {
    const nonNullishTypes = typeNode.types.filter(
      (type) => !isNullishType(type),
    );
    return (
      nonNullishTypes.length !== 1 ||
      needsExplicitColumnType(nonNullishTypes[0])
    );
  }

  if (ts.isLiteralTypeNode(typeNode)) return false;

  if (ts.isTypeReferenceNode(typeNode)) {
    return typeNode.typeName.getText() !== 'Date';
  }

  return true;
}

function findViolations(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
  );
  const violations = [];

  function visit(node) {
    if (ts.isPropertyDeclaration(node)) {
      const columnCall = getDecoratorCall(node, 'Column');
      if (
        columnCall &&
        !hasExplicitColumnType(columnCall) &&
        needsExplicitColumnType(node.type)
      ) {
        const position = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(),
        );
        violations.push({
          filePath,
          line: position.line + 1,
          column: position.character + 1,
          field: node.name.getText(sourceFile),
          type: node.type?.getText(sourceFile) ?? '未声明类型',
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

const violations = collectEntityFiles(sourceRoot).flatMap(findViolations);

if (violations.length) {
  console.error('\nTypeORM 实体列校验失败：');
  for (const violation of violations) {
    const relativePath = path.relative(
      path.resolve(__dirname, '..'),
      violation.filePath,
    );
    console.error(
      `- ${relativePath}:${violation.line}:${violation.column} 字段“${violation.field}”类型为“${violation.type}”，` +
        '但 @Column 未显式声明 type。联合类型、对象、数组和类型别名可能被反射为 Object，MySQL 无法映射。',
    );
  }
  console.error(
    "\n修复示例：@Column({ type: 'varchar', length: 40, nullable: true })。",
  );
  process.exitCode = 1;
} else {
  console.log('TypeORM 实体列校验通过。');
}
