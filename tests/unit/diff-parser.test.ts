import { describe, it, expect } from 'vitest';
import { parseDiff } from '../../src/services/diff-parser.js';

describe('Diff Parser', () => {
  it('should parse a simple single-file diff', () => {
    const diff = `diff --git a/test.js b/test.js
index 1234567..abcdefg 100644
--- a/test.js
+++ b/test.js
@@ -1,3 +1,5 @@
 function hello() {
+  eval(userInput);
+  console.log('debug');
   return true;
 }`;

    const files = parseDiff(diff);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('test.js');
    expect(files[0].addedLines).toHaveLength(2);
    expect(files[0].addedLines[0]).toEqual({
      lineNumber: 2,
      content: '  eval(userInput);',
    });
    expect(files[0].addedLines[1]).toEqual({
      lineNumber: 3,
      content: "  console.log('debug');",
    });
  });

  it('should parse multi-file diffs', () => {
    const diff = `diff --git a/file1.js b/file1.js
--- a/file1.js
+++ b/file1.js
@@ -1,2 +1,3 @@
 const a = 1;
+const b = eval("2");
 const c = 3;
diff --git a/file2.js b/file2.js
--- a/file2.js
+++ b/file2.js
@@ -1,2 +1,3 @@
 const x = 1;
+console.log(x);
 const y = 2;`;

    const files = parseDiff(diff);
    expect(files).toHaveLength(2);
    expect(files[0].path).toBe('file1.js');
    expect(files[0].addedLines).toHaveLength(1);
    expect(files[0].addedLines[0].lineNumber).toBe(2);
    expect(files[1].path).toBe('file2.js');
    expect(files[1].addedLines).toHaveLength(1);
    expect(files[1].addedLines[0].lineNumber).toBe(2);
  });

  it('should handle multiple hunks in a single file', () => {
    const diff = `diff --git a/app.js b/app.js
--- a/app.js
+++ b/app.js
@@ -1,3 +1,4 @@
 const config = {};
+const secret = "abc";
 function init() {
   return config;
@@ -10,3 +11,4 @@
 function cleanup() {
+  console.log("done");
   process.exit(0);
 }`;

    const files = parseDiff(diff);
    expect(files).toHaveLength(1);
    expect(files[0].addedLines).toHaveLength(2);
    expect(files[0].addedLines[0].lineNumber).toBe(2);
    expect(files[0].addedLines[1].lineNumber).toBe(12);
  });

  it('should not count +++ header as an added line', () => {
    const diff = `diff --git a/new.js b/new.js
--- /dev/null
+++ b/new.js
@@ -0,0 +1,2 @@
+const x = 1;
+const y = 2;`;

    const files = parseDiff(diff);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('new.js');
    expect(files[0].addedLines).toHaveLength(2);
    // Ensure +++ line is NOT in addedLines
    expect(files[0].addedLines.every((l) => !l.content.startsWith('++ '))).toBe(true);
  });

  it('should handle empty diffs', () => {
    const files = parseDiff('');
    expect(files).toHaveLength(0);
  });

  it('should handle diffs with deleted lines only', () => {
    const diff = `diff --git a/old.js b/old.js
--- a/old.js
+++ b/old.js
@@ -1,3 +1,1 @@
-const a = 1;
-const b = 2;
 const c = 3;`;

    const files = parseDiff(diff);
    expect(files).toHaveLength(1);
    expect(files[0].addedLines).toHaveLength(0);
  });
});
