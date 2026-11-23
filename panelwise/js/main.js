"use strict";
/* ---------- boot ---------- */
S.view = PW.single ? "upload" : "library"; render();
// The platform adapter sets up the database, folder access and saved work, then Claude and the folder scan.
PW.boot();
$("#setBtn").onclick = () => { S.view = "settings"; render(); window.scrollTo(0, 0); };
