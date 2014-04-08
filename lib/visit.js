/**
 * Copyright (c) 2014, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * https://raw.github.com/facebook/regenerator/master/LICENSE file. An
 * additional grant of patent rights can be found in the PATENTS file in
 * the same directory.
 */

var assert = require("assert");
var types = require("recast").types;
var n = types.namedTypes;
var b = types.builders;
var hoist = require("./hoist").hoist;
var Emitter = require("./emit").Emitter;

exports.transform = function(ast) {
  return types.traverse(ast, visitNode);
};

// Makes a unique context identifier. This is needed to handle retrieval of
// tempvars from contexts up the scope in nested generator situation.
// see issue #70
var nextCtxId = 0;
function makeContextId() {
  return b.identifier("$ctx" + nextCtxId++);
}

function visitNode(node) {
  if (!n.Function.check(node) || !(node.generator || node.async)) {
    // Note that because we are not returning false here the traversal
    // will continue into the subtree rooted at this node, as desired.
    return;
  }

  node.generator = false;

  if (node.expression) {
    // Transform expression lambdas into normal functions.
    node.expression = false;
    node.body = b.blockStatement([
      b.returnStatement(node.body)
    ]);
  }

  // TODO Ensure these identifiers are named uniquely.
  var contextId = makeContextId();
  var functionId = node.id ? b.identifier(node.id.name + "$") : null/*Anonymous*/;
  var argsId = b.identifier("$args");
  var wrapGeneratorId = b.identifier("wrapGenerator");
  var shouldAliasArguments = renameArguments(this, argsId);
  var vars = hoist(this);

  if (shouldAliasArguments) {
    vars = vars || b.variableDeclaration("var", []);
    vars.declarations.push(b.variableDeclarator(
      argsId, b.identifier("arguments")
    ));
  }

  if (node.async) {
    renameAwaitToYield(this.get("body"));
  }

  var emitter = new Emitter(contextId);
  emitter.explode(this.get("body"));

  var outerBody = [];

  if (vars && vars.declarations.length > 0) {
    outerBody.push(vars);
  }

  var wrapGenArgs = [
    emitter.getContextFunction(functionId),
    b.thisExpression()
  ];

  var tryEntryList = emitter.getTryEntryList();
  if (tryEntryList) {
    wrapGenArgs.push(tryEntryList);
  }

  var wrapGenCall = b.callExpression(
    node.async ? b.memberExpression(
      wrapGeneratorId,
      b.identifier("async"),
      false
    ) : wrapGeneratorId,
    wrapGenArgs
  );

  outerBody.push(b.returnStatement(wrapGenCall));

  node.body = b.blockStatement(outerBody);

  if (node.async) {
    node.async = false;
    return;
  }

  var markMethod = b.memberExpression(
    wrapGeneratorId,
    b.identifier("mark"),
    false
  );

  if (n.FunctionDeclaration.check(node)) {
    var path = this.parent;

    while (path && !(n.BlockStatement.check(path.value) ||
                     n.Program.check(path.value))) {
      path = path.parent;
    }

    if (path) {
      var firstStmtPath = path.get("body", 0);

      // If the first statement is a "use strict" declaration, make sure to
      // insert our call afterwards
      if (n.ExpressionStatement.check(firstStmtPath.value) &&
          n.Literal.check(firstStmtPath.value.expression) &&
          firstStmtPath.value.expression.value === "use strict") {
        firstStmtPath = path.get("body", 1);
      }

      firstStmtPath.replace(
        b.expressionStatement(b.callExpression(markMethod, [node.id])),
        firstStmtPath.value
      );
    }

  } else {
    n.FunctionExpression.assert(node);
    this.replace(b.callExpression(markMethod, [node]));
  }
}

function renameArguments(funcPath, argsId) {
  assert.ok(funcPath instanceof types.NodePath);
  var func = funcPath.value;
  var didReplaceArguments = false;
  var hasImplicitArguments = false;

  types.traverse(funcPath, function(node) {
    if (node === func) {
      hasImplicitArguments = !this.scope.lookup("arguments");
    } else if (n.Function.check(node)) {
      return false;
    }

    if (n.Identifier.check(node) && node.name === "arguments") {
      var isMemberProperty =
        n.MemberExpression.check(this.parent.node) &&
        this.name === "property" &&
        !this.parent.node.computed;

      if (!isMemberProperty) {
        this.replace(argsId);
        didReplaceArguments = true;
        return false;
      }
    }
  });

  // If the traversal replaced any arguments identifiers, and those
  // identifiers were free variables, then we need to alias the outer
  // function's arguments object to the variable named by argsId.
  return didReplaceArguments && hasImplicitArguments;
}

function renameAwaitToYield(bodyPath) {
  types.traverse(bodyPath, function(node) {
    if (n.Function.check(node)) {
      return; // Don't descend into nested function scopes.
    }

    if (n.AwaitExpression.check(node)) {
      this.replace(b.yieldExpression(
        node.all ? b.callExpression(
          b.memberExpression(
            b.identifier("Promise"),
            b.identifier("all"),
            false
          ),
          [node.argument]
        ) : node.argument,
        false
      ));
    }
  });
}
