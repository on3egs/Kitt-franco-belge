import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const destination = path.join(root, "client", "public", "open-source-licenses");
fs.mkdirSync(destination, { recursive: true });
const files = [
  ["docx/LICENSE", "docx-MIT.txt"],
  ["fflate/LICENSE", "fflate-MIT.txt"],
  ["pdf-lib/LICENSE.md", "pdf-lib-MIT.txt"],
  ["pdfjs-dist/LICENSE", "pdfjs-APACHE-2.0.txt"],
  ["jszip/LICENSE.markdown", "jszip-MIT-option.txt"],
  ["nanoid/LICENSE", "nanoid-MIT.txt"],
  ["@pdf-lib/standard-fonts/LICENSE.md", "pdf-standard-fonts-MIT.txt"],
  ["@pdf-lib/upng/LICENSE", "pdf-upng-MIT.txt"],
  ["pako/LICENSE", "pako-MIT.txt"],
  ["tslib/LICENSE.txt", "tslib-0BSD.txt"],
  ["pdfjs-dist/cmaps/LICENSE", "pdf-cmaps-ADOBE.txt"],
  ["pdfjs-dist/standard_fonts/LICENSE_LIBERATION", "pdf-liberation-fonts-OFL.txt"],
  ["pdfjs-dist/standard_fonts/LICENSE_FOXIT", "pdf-foxit-fonts.txt"],
  ["pdfjs-dist/wasm/LICENSE_JBIG2", "pdf-jbig2-BSD.txt"],
  ["pdfjs-dist/wasm/LICENSE_OPENJPEG", "pdf-openjpeg-BSD.txt"],
  ["pdfjs-dist/wasm/LICENSE_QCMS", "pdf-qcms-MIT.txt"],
  ["pdfjs-dist/wasm/LICENSE_PDFJS_JBIG2", "pdf-pdfjs-jbig2-APACHE.txt"],
  ["pdfjs-dist/wasm/LICENSE_PDFJS_OPENJPEG", "pdf-pdfjs-openjpeg-APACHE.txt"],
  ["pdfjs-dist/wasm/LICENSE_PDFJS_QCMS", "pdf-pdfjs-qcms-APACHE.txt"],
];
for (const [source, name] of files) {
  const from = path.join(root, "node_modules", source);
  if (!fs.existsSync(from)) throw new Error(`Missing license notice: ${source}`);
  fs.copyFileSync(from, path.join(destination, name));
}
const hashJs = `MIT License\n\nCopyright (c) Fedor Indutny, 2014.\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY.\n`;
fs.writeFileSync(path.join(destination, "hash-js-MIT.txt"), hashJs, "utf8");
console.log(`Copied ${files.length + 1} upstream license notices to ${path.relative(root, destination)}.`);
