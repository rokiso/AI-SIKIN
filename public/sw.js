"use strict";

// Installation foundation only: the browser's default worker lifecycle applies.
// There is deliberately no fetch handler, Cache API use, clients.claim() or
// skipWaiting(). HTML, RSC, APIs, authentication, and personal images always use
// the network; this worker cannot save or replay a visitor's private responses.
