"use strict";

const {setGlobalOptions} = require("firebase-functions/v2");

// Keep Functions initialized and bounded while the validated server-side
// intake endpoint is completed in a separate release.
setGlobalOptions({maxInstances: 10});
