#!/usr/bin/env node
/**
 * Eki JSX/TSX interactive-control candidate inventory.
 * Run from the Eki repository (with npm ci installed):
 *   node docs/testing/skills/eki-antigravity-webapp-audit/scripts/control-census.mjs \
 *       --repo . --out artifacts/qa/interaction-audit/source-census
 * Never claims a control has actually been clicked or tested.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
function opt(name, fallback) {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`${name} requires a path`);
  return args[i + 1];
}
const repo = path.resolve(opt('--repo', process.cwd()));
const out = path.resolve(opt('--out', path.join(repo, 'artifacts/qa/interaction-audit/source-census')));
const sourceRoot = path.join(repo, 'frontend/src');
if (!fs.existsSync(sourceRoot)) {
  console.error(`Eki frontend/src not found under ${repo}. Run from the repo or pass --repo.`);
  process.exit(2);
}
let ts;
try {
  const fromRepo = createRequire(path.join(repo, 'package.json'));
  ts = fromRepo('typescript');
} catch {
  try { ts = createRequire(import.meta.url)('typescript'); }
  catch {
    console.error('TypeScript package not found. Run npm ci at Eki repository root first.');
    process.exit(2);
  }
}
const extensions = /\.(tsx|jsx)$/i;
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a,b)=>a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.') || ['node_modules', '__tests__', '__mocks__', 'fixtures'].includes(entry.name)) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.isFile() && extensions.test(entry.name) && !/\.(test|spec)\.(tsx|jsx)$/i.test(entry.name)) files.push(p);
  }
}
walk(sourceRoot);

function short(s, limit = 210) { return s.replace(/\s+/g, ' ').trim().slice(0, limit); }
function attrText(attr, src) {
  if (!attr?.initializer) return '';
  if (ts.isStringLiteral(attr.initializer)) return attr.initializer.text;
  if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
    const e = attr.initializer.expression;
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
    return short(e.getText(src));
  }
  return short(attr.initializer.getText(src));
}
function childText(parent, src) {
  const result=[];
  if (!parent || !ts.isJsxElement(parent)) return '';
  function descend(n, depth) {
    if (result.join(' ').length >= 100 || depth>4) return;
    if (ts.isJsxText(n)) result.push(n.getText(src));
    else if (ts.isJsxExpression(n) && n.expression && (ts.isStringLiteral(n.expression)||ts.isNoSubstitutionTemplateLiteral(n.expression))) result.push(n.expression.text);
    else if (ts.isJsxElement(n)) n.children.forEach(x=>descend(x, depth+1));
    else if (ts.isJsxFragment(n)) n.children.forEach(x=>descend(x, depth+1));
  }
  parent.children.forEach(x=>descend(x,0));
  return short(result.join(' '),140);
}
const interactiveTags = new Set(['button','input','select','option','textarea','a','form','summary','details','label','dialog']);
const roles = new Set(['button','tab','link','switch','checkbox','radio','combobox','option','menuitem','slider','textbox','searchbox','dialog']);
const attrsLike = new Set(['onclick','onchange','onsubmit','onkeydown','onkeyup','onkeypress','ondblclick','onpointerdown','onpointerup','onmousedown','onmouseup','ontouchstart','ontouchend','ondragend','ondragstart','ondrop','onblur','onfocus','oninput','onselect','onclose','onopen','onidle']);
const records=[];
const routes=[];
for (const filename of files) {
  const rel = path.relative(repo,filename).replaceAll('\\','/');
  const source = fs.readFileSync(filename,'utf8');
  const ast = ts.createSourceFile(rel, source, ts.ScriptTarget.Latest, true, filename.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.JSX);
  if (rel.startsWith('frontend/src/app/') && /(?:^|\/)page\.(jsx|tsx)$/.test(rel)) {
    const sub = rel.slice('frontend/src/app/'.length).replace(/(?:^|\/)page\.(jsx|tsx)$/, '').split('/').filter(Boolean).filter(s=>!(s.startsWith('(')&&s.endsWith(')')));
    routes.push({route:'/'+sub.join('/'),source_path:rel});
  }
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(ast);
      const isNative = interactiveTags.has(tag.toLowerCase());
      const allAttrs={};
      for (const a of node.attributes.properties) {
        if (!ts.isJsxAttribute(a)) continue;
        allAttrs[a.name.getText(ast)] = attrText(a,ast);
      }
      const handlers = Object.keys(allAttrs).filter(x=>attrsLike.has(x.toLowerCase()));
      const role = (allAttrs.role || '').toLowerCase();
      const hasControlRole = roles.has(role);
      const extra = 'tabIndex' in allAttrs || 'tabindex' in allAttrs || 'contentEditable' in allAttrs || 'contenteditable' in allAttrs;
      const maps = /^(AdvancedMarker|Marker|Map|GoogleMap|InfoWindow|InAppSelect|CustomSelect|ConfirmModal|AlertModal|BottomSheet|RouteCarousel|FeedbackModal|MessagingPanel)$/.test(tag);
      if (isNative || handlers.length || hasControlRole || extra || maps) {
        const loc = ast.getLineAndCharacterOfPosition(node.getStart(ast));
        const line = loc.line+1;
        const display=short(allAttrs['aria-label'] || allAttrs.title || allAttrs.placeholder || childText(node.parent,ast) || allAttrs.name || allAttrs.id || allAttrs['data-testid'] || '');
        const raw = `${rel}:${line}:${loc.character+1}:${tag}:${Object.keys(allAttrs).join(',')}`;
        records.push({id:'src-'+crypto.createHash('sha256').update(raw).digest('hex').slice(0,12), source_path:rel, source_line:line, source_column:loc.character+1, tag, role, label_clue:display, handlers, testid:allAttrs['data-testid'] || '', aria_label:allAttrs['aria-label'] || '', placeholder:allAttrs.placeholder || '', type:allAttrs.type || '', disabled_clue:allAttrs.disabled || '', href_clue:allAttrs.href || '', notes:'SOURCE CANDIDATE ONLY: not a browser pass'});
      }
    }
    ts.forEachChild(node,visit);
  }
  visit(ast);
}
records.sort((a,b)=>a.source_path.localeCompare(b.source_path)||a.source_line-b.source_line);
routes.sort((a,b)=>a.route.localeCompare(b.route));
fs.mkdirSync(out,{recursive:true});
const data = {generated_at:new Date().toISOString(),repo,files_scanned:files.length,source_candidates:records.length,candidates:records,routes};
fs.writeFileSync(path.join(out,'control-inventory.json'),JSON.stringify(data,null,2)+'\n');
const columns=['id','source_path','source_line','source_column','tag','role','label_clue','handlers','testid','aria_label','placeholder','type','href_clue','notes'];
function quote(v) { const s=Array.isArray(v)?v.join('|'):String(v??''); return /[",\r\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s; }
fs.writeFileSync(path.join(out,'control-inventory.csv'),columns.join(',')+'\n'+records.map(r=>columns.map(k=>quote(r[k])).join(',')).join('\n')+'\n');
fs.writeFileSync(path.join(out,'routes.json'),JSON.stringify(routes,null,2)+'\n');
console.log(`Scanned ${files.length} JSX/TSX files; ${records.length} source-level interactive candidates; ${routes.length} Next pages.`);
console.log(`Wrote ${path.join(out,'control-inventory.json')}, .csv and routes.json.`);
console.log('WARNING: Static census is not browser coverage. Reconcile with actual rendered controls and click assertions.');
