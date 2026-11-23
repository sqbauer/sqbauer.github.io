"use strict";
/* ---------- boot ---------- */
S.view = PW.single ? "upload" : "library"; render();
// was: initClaude(); initDb(); initAssets();  (claude.ai). The platform adapter sets up the
// database, folder access and first-run import before loading saved work and Claude.
PW.boot();
$("#setBtn").onclick = () => { S.view = "settings"; render(); window.scrollTo(0, 0); };
