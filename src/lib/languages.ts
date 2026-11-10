export type LanguageInfo = {
  id: string;
  name: string;
  hljs: string;
};

function language(id: string, name: string, hljs: string): LanguageInfo {
  return { id, name, hljs };
}

const text = language("text", "Text", "plaintext");
const markdown = language("markdown", "Markdown", "markdown");
const typescript = language("typescript", "TypeScript", "typescript");
const javascript = language("javascript", "JavaScript", "javascript");
const json = language("json", "JSON", "json");
const html = language("html", "HTML", "xml");
const xml = language("xml", "XML", "xml");
const css = language("css", "CSS", "css");
const scss = language("scss", "SCSS", "scss");
const less = language("less", "Less", "less");
const yaml = language("yaml", "YAML", "yaml");
const toml = language("toml", "TOML", "ini");
const ini = language("ini", "Config", "ini");
const shell = language("shell", "Shell", "bash");
const powershell = language("powershell", "PowerShell", "powershell");
const batch = language("batch", "Batch", "dos");
const python = language("python", "Python", "python");
const ruby = language("ruby", "Ruby", "ruby");
const php = language("php", "PHP", "php");
const java = language("java", "Java", "java");
const kotlin = language("kotlin", "Kotlin", "kotlin");
const c = language("c", "C", "c");
const cpp = language("cpp", "C++", "cpp");
const csharp = language("csharp", "C#", "csharp");
const go = language("go", "Go", "go");
const rust = language("rust", "Rust", "rust");
const swift = language("swift", "Swift", "swift");
const dart = language("dart", "Dart", "dart");
const lua = language("lua", "Lua", "lua");
const r = language("r", "R", "r");
const sql = language("sql", "SQL", "sql");
const graphql = language("graphql", "GraphQL", "graphql");
const dockerfile = language("dockerfile", "Dockerfile", "dockerfile");
const makefile = language("makefile", "Makefile", "makefile");
const cmake = language("cmake", "CMake", "cmake");
const gradle = language("gradle", "Gradle", "gradle");
const groovy = language("groovy", "Groovy", "groovy");
const elixir = language("elixir", "Elixir", "elixir");
const erlang = language("erlang", "Erlang", "erlang");
const haskell = language("haskell", "Haskell", "haskell");
const scala = language("scala", "Scala", "scala");
const clojure = language("clojure", "Clojure", "clojure");
const julia = language("julia", "Julia", "julia");
const protobuf = language("protobuf", "Protobuf", "protobuf");
const nix = language("nix", "Nix", "nix");
const nim = language("nim", "Nim", "nim");
const ocaml = language("ocaml", "OCaml", "ocaml");
const reason = language("reason", "Reason", "reasonml");
const fsharp = language("fsharp", "F#", "fsharp");
const elm = language("elm", "Elm", "elm");
const coffeescript = language("coffeescript", "CoffeeScript", "coffeescript");
const objectivec = language("objectivec", "Objective-C", "objectivec");
const matlab = language("matlab", "MATLAB", "matlab");
const perl = language("perl", "Perl", "perl");
const latex = language("latex", "LaTeX", "latex");
const verilog = language("verilog", "Verilog", "verilog");
const vhdl = language("vhdl", "VHDL", "vhdl");
const assembly = language("assembly", "Assembly", "x86asm");
const wasm = language("wasm", "WebAssembly", "wasm");
const diff = language("diff", "Diff", "diff");
const vue = language("vue", "Vue", "xml");
const svelte = language("svelte", "Svelte", "xml");
const astro = language("astro", "Astro", "xml");
const prisma = language("prisma", "Prisma", "plaintext");
const terraform = language("terraform", "Terraform", "plaintext");
const csv = language("csv", "CSV", "plaintext");
const ipynb = language("ipynb", "Jupyter Notebook", "json");
const image = language("image", "Image", "plaintext");
const pdf = language("pdf", "PDF", "plaintext");
const lock = language("lock", "Lockfile", "plaintext");
const log = language("log", "Log", "plaintext");

const BY_EXTENSION: Record<string, LanguageInfo> = {
  ts: typescript,
  tsx: typescript,
  mts: typescript,
  cts: typescript,
  js: javascript,
  jsx: javascript,
  mjs: javascript,
  cjs: javascript,
  json: json,
  jsonc: json,
  json5: json,
  geojson: json,
  webmanifest: json,
  ipynb: ipynb,
  html: html,
  htm: html,
  xhtml: html,
  xml: xml,
  svg: xml,
  xsl: xml,
  xslt: xml,
  plist: xml,
  csproj: xml,
  fsproj: xml,
  vbproj: xml,
  css: css,
  scss: scss,
  sass: scss,
  less: less,
  md: markdown,
  mdx: markdown,
  markdown: markdown,
  yml: yaml,
  yaml: yaml,
  toml: toml,
  ini: ini,
  cfg: ini,
  conf: ini,
  properties: ini,
  env: ini,
  editorconfig: ini,
  sh: shell,
  bash: shell,
  zsh: shell,
  fish: shell,
  ksh: shell,
  ps1: powershell,
  psm1: powershell,
  psd1: powershell,
  bat: batch,
  cmd: batch,
  py: python,
  pyw: python,
  pyi: python,
  rb: ruby,
  rake: ruby,
  gemspec: ruby,
  php: php,
  phtml: php,
  java: java,
  kt: kotlin,
  kts: kotlin,
  c: c,
  h: c,
  cpp: cpp,
  cc: cpp,
  cxx: cpp,
  hpp: cpp,
  hxx: cpp,
  hh: cpp,
  ino: cpp,
  cs: csharp,
  csx: csharp,
  go: go,
  rs: rust,
  swift: swift,
  dart: dart,
  lua: lua,
  r: r,
  rmd: r,
  sql: sql,
  graphql: graphql,
  gql: graphql,
  dockerfile: dockerfile,
  mk: makefile,
  cmake: cmake,
  gradle: gradle,
  groovy: groovy,
  gvy: groovy,
  ex: elixir,
  exs: elixir,
  erl: erlang,
  hrl: erlang,
  hs: haskell,
  lhs: haskell,
  scala: scala,
  sc: scala,
  clj: clojure,
  cljs: clojure,
  cljc: clojure,
  edn: clojure,
  jl: julia,
  proto: protobuf,
  nix: nix,
  nim: nim,
  ml: ocaml,
  mli: ocaml,
  re: reason,
  rei: reason,
  fs: fsharp,
  fsx: fsharp,
  fsi: fsharp,
  elm: elm,
  coffee: coffeescript,
  m: objectivec,
  mm: objectivec,
  matlab: matlab,
  pl: perl,
  pm: perl,
  tex: latex,
  sty: latex,
  cls: latex,
  bib: latex,
  v: verilog,
  sv: verilog,
  svh: verilog,
  vh: verilog,
  vhd: vhdl,
  vhdl: vhdl,
  asm: assembly,
  s: assembly,
  wasm: wasm,
  wat: wasm,
  diff: diff,
  patch: diff,
  vue: vue,
  svelte: svelte,
  astro: astro,
  prisma: prisma,
  tf: terraform,
  tfvars: terraform,
  csv: csv,
  tsv: csv,
  png: image,
  jpg: image,
  jpeg: image,
  gif: image,
  webp: image,
  avif: image,
  ico: image,
  bmp: image,
  tif: image,
  tiff: image,
  pdf: pdf,
  lock: lock,
  lockb: lock,
  log: log,
  txt: text,
  text: text,
};

const BY_FILENAME: Record<string, LanguageInfo> = {
  dockerfile: dockerfile,
  "dockerfile.dev": dockerfile,
  "dockerfile.prod": dockerfile,
  makefile: makefile,
  "makefile.am": makefile,
  "makefile.in": makefile,
  "cmakelists.txt": cmake,
  "package.json": json,
  "package-lock.json": json,
  "tsconfig.json": json,
  "jsconfig.json": json,
  "composer.json": json,
  "cargo.toml": toml,
  "cargo.lock": toml,
  "pyproject.toml": toml,
  "poetry.lock": toml,
  "go.mod": text,
  "go.sum": text,
  "gemfile": ruby,
  "gemfile.lock": text,
  "rakefile": ruby,
  "vagrantfile": ruby,
  "jenkinsfile": groovy,
  "build.gradle": gradle,
  "settings.gradle": gradle,
  "build.gradle.kts": gradle,
  "settings.gradle.kts": gradle,
  "pom.xml": xml,
  "requirements.txt": text,
  "nginx.conf": language("nginx", "Nginx", "nginx"),
  ".htaccess": language("apache", "Apache", "apache"),
  ".env": ini,
  ".env.local": ini,
  ".env.example": ini,
  ".env.development": ini,
  ".env.production": ini,
  ".gitignore": text,
  ".gitattributes": text,
  ".dockerignore": text,
  ".editorconfig": ini,
  ".npmrc": ini,
  ".yarnrc": ini,
  ".prettierrc": json,
  ".eslintrc": json,
  "readme": markdown,
  "readme.md": markdown,
  "license": text,
  "license.md": markdown,
  "changelog.md": markdown,
  "contributing.md": markdown,
};

export function languageForPath(path: string): LanguageInfo {
  const normalized = path.replace(/\\/g, "/");
  const base = (normalized.split("/").pop() ?? normalized).toLowerCase();

  const exact = BY_FILENAME[base];
  if (exact) return exact;
  if (base === ".env" || base.startsWith(".env.")) return ini;
  if (base.startsWith("dockerfile")) return dockerfile;
  if (base.startsWith("makefile")) return makefile;
  if (base.endsWith(".gradle.kts")) return gradle;

  const ext = base.includes(".") ? base.split(".").pop() ?? "" : "";
  return BY_EXTENSION[ext] ?? text;
}
