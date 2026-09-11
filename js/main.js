const userForm = document.getElementById("user");
const userName = document.getElementById("userName");
const userSecret = document.getElementById("userSecret");
const algorithmVersion = document.getElementById("algorithmVersion");
const userError = document.getElementById("userError");
const siteForm = document.getElementById("site");
const identity = document.getElementById("identity");
const siteName = document.getElementById("siteName");
const siteCounter = document.getElementById("siteCounter");
const siteType = document.getElementById("siteType");
const siteResult = document.getElementById("siteResult");
const siteError = document.getElementById("siteError");
const seedNotice = document.getElementById("seedNotice");
const copyButton = document.getElementById("copy");
const signOutButton = document.getElementById("signout");

for (let version = spectre.algorithm.first; version <= spectre.algorithm.last; version++) {
    algorithmVersion.add(new Option(`V${version}`, version));
}
for (const template in spectre.templates) {
    siteType.add(new Option(spectre.resultName[template], template));
}
siteType.add(new Option(spectre.resultName[spectre.resultType.deriveMnemonic], spectre.resultType.deriveMnemonic));

function purpose() {
    return siteForm.elements.sitePurpose.value;
}

function updateDefaults() {
    algorithmVersion.value = spectre.algorithm.current;
    siteCounter.value = spectre.counter.initial;
    switch (purpose()) {
        case spectre.purpose.authentication:
            siteType.value = spectre.resultType.defaultPassword;
            break;
        case spectre.purpose.identification:
            siteType.value = spectre.resultType.defaultLogin;
            break;
        case spectre.purpose.recovery:
            siteType.value = spectre.resultType.defaultAnswer;
            break;
    }
}

// Why: the counter field's min/max/step are the single definition of a valid
// counter. The algorithm accepts any integer up to 2^32-1 and truncates a
// fraction, so an invalid entry used to show a derived result that the Copy
// button then refused; now nothing is derived until the field validates.
function updateSpectre() {
    if (siteCounter.validity.valid) {
        spectre.request(siteName.value, siteType.value, siteCounter.value, purpose(), null);
    } else {
        updateView();
    }
}

// The identicon is the check that the secret was typed right: it is derived
// from name and secret, so a typo shows a different figure.
function identicon(icon) {
    return icon ? [icon.leftArm, icon.body, icon.rightArm, icon.accessory].join("") : "";
}

function updateView() {
    const user = spectre.operations.user;
    const site = spectre.operations.site;
    const signedIn = user.authenticated;

    userForm.hidden = signedIn;
    siteForm.hidden = !signedIn;
    userError.textContent = user.error || "";
    siteError.textContent = site.error || "";
    userSecret.value = "";

    if (signedIn) {
        identity.textContent = `${user.userName} ${identicon(user.identicon)}`;
        seedNotice.hidden = siteType.value != spectre.resultType.deriveMnemonic;
        if (siteCounter.validity.valid) {
            siteResult.value = spectre.result(siteName.value, purpose(), null, siteType.value, siteCounter.value) || (site.pending ? "…" : "");
        } else {
            siteError.textContent = siteCounter.validationMessage;
            siteResult.value = "";
        }
    } else {
        userName.value = user.userName || "";
        siteName.value = "";
        siteResult.value = "";
    }
}

updateDefaults();
spectre.observers.push(updateView);
updateView();

userForm.addEventListener("submit", (event) => {
    event.preventDefault();
    spectre.authenticate(userName.value, userSecret.value, algorithmVersion.value);
});
siteForm.addEventListener("submit", (event) => {
    event.preventDefault();
    navigator.clipboard.writeText(siteResult.value).then(() => {
        copyButton.textContent = "Copied";
        setTimeout(() => { copyButton.textContent = "Copy"; }, 1000);
    });
});
signOutButton.addEventListener("click", () => {
    spectre.invalidate();
});
// Why: the iOS app switcher keeps a snapshot of the last frame, and a seed
// phrase must not sit in it. The result comes back from the cache on return.
document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        siteResult.value = "";
    } else if (spectre.operations.user.authenticated) {
        // Not an unconditional updateView because: signed out, it resets the
        // sign-in fields, and a screen lock mid-typing would erase the secret.
        updateView();
    }
});
siteName.addEventListener("input", updateSpectre);
siteCounter.addEventListener("input", updateSpectre);
siteType.addEventListener("input", updateSpectre);
siteForm.elements.sitePurpose.forEach((radio) => radio.addEventListener("input", () => {
    updateDefaults();
    updateSpectre();
}));

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js");
}
