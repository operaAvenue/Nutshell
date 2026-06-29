const { JSDOM } = require('jsdom');
const fs = require('fs');
const js = fs.readFileSync('data/assets/index-DOIhzbWO.js', 'utf8');

const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="root"></div></body></html>`, {
  runScripts: "dangerously"
});

dom.window.onerror = function(msg, source, lineno, colno, error) {
  console.error("JSDOM Error:", msg, error);
};

try {
  dom.window.eval(js);
  console.log("JS executed successfully.");
} catch (e) {
  console.error("Exception thrown during eval:", e);
}
