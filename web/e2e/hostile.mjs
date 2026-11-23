// Hostile text posted by seed-txs.mjs and checked by the tests: quotes,
// backslashes, unicode, newlines, tabs, parentheses, commas, braces, HTML,
// Markdown, math and mentions. It must show as plain text everywhere.
export const HOSTILE_TITLE = 'He said "hi" \\o/ (a, b) {x} ünï 日本 <b>$x$</b> @alice';
export const HOSTILE_DETAILS =
  'Line one with "quotes" and \\backslash\\\n(struct{("fake" string)} x) , } { ]\n<script>alert(1)</script> [link](https://e.vil) ![i](https://e.vil/i.png)\ng1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5 tabs\there';
export const HOSTILE_REASON = 'Missing "tests"\nand a \\ backslash, (paren) {brace}';
export const HOSTILE_LINK = 'https://e.vil/a_(b)?q="x"&y={z}';
