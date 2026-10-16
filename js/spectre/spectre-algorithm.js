// =============================================================================
// Created by Maarten Billemont on 2021-11-28.
// Copyright (c) 2011, Maarten Billemont.
//
// This file is part of Spectre.
// Spectre is free software. You can modify it under the terms of
// the GNU General Public License, either version 3 or any later version.
// See the LICENSE file for details or consult <http://www.gnu.org/licenses/>.
//
// Note: this grant does not include any rights for use of Spectre's trademarks.
// =============================================================================

/**
 * spectre-algorithm
 * =================
 * 
 * This file is responsible for implementing the Spectre algorithm implementation.
 * 
 * It provides a SpectreUser class which can be used to instantiate and interact with a single long-lived Spectre user identity.
 * 
 * It attaches the following functions to the global `spectre` object:
 * `newUserKey`, `newSiteKey`, `newSiteResult`, `newMask` & `newIdenticon`: They are used to perform stateless Spectre algorithm operations.
 */

importScripts(new URL("js/spectre/spectre-types.js", baseURI).href);
importScripts(new URL("js/spectre/scrypt.js", baseURI).href);
importScripts(new URL("js/spectre/bip39.js", baseURI).href);

class SpectreError extends Error {
    constructor(cause, ...params) {
        super(...params)
        this.name = "SpectreError"
        this.cause = cause
    }
}

class SpectreUser {
    constructor(userName, userSecret, algorithmVersion = spectre.algorithm.current) {
        this.userName = userName;
        this.algorithmVersion = algorithmVersion;
        this.userKeyPromise = spectre.newUserKey(userName, userSecret, algorithmVersion);
        this.identiconPromise = this.userKeyPromise.then(spectre.newIdenticon);

    }

    async password(siteName, resultType = spectre.resultType.defaultPassword,
                       keyCounter = spectre.counter.default, keyContext = null) {
        let userKey = await this.userKeyPromise
        return this.result(userKey, siteName, resultType, keyCounter, spectre.purpose.authentication, keyContext);
    }

    async login(siteName, resultType = spectre.resultType.defaultLogin,
                keyCounter = spectre.counter.default, keyContext = null) {
        let userKey = await this.userKeyPromise
        return this.result(userKey, siteName, resultType, keyCounter, spectre.purpose.identification, keyContext);
    }

    async answer(siteName, resultType = spectre.resultType.defaultAnswer,
                 keyCounter = spectre.counter.default, keyContext = null) {
        let userKey = await this.userKeyPromise
        return this.result(userKey, siteName, resultType, keyCounter, spectre.purpose.recovery, keyContext);
    }

    async result(siteName, resultType, keyCounter, keyPurpose, keyContext) {
        let userKey = await this.userKeyPromise
        return spectre.newSiteResult(userKey, siteName, resultType, keyCounter, keyPurpose, keyContext);
    }

    async mask(siteName, keyCounter, text, unmask) {
        let userKey = await this.userKeyPromise
        return spectre.newMask(userKey, siteName, keyCounter, text, unmask);
    }

    invalidate() {
        this.userKeyPromise = Promise.reject(new SpectreError("invalidate", `User logged out.`));
    }
}

spectre.newUserKey = Object.freeze(async(userName, userSecret, algorithmVersion = spectre.algorithm.current) => {
    console.trace(`[spectre]: userKey: ${userName} (algorithmVersion=${algorithmVersion})`);

    if (!crypto.subtle) {
        throw new SpectreError("internal", `Cryptography unavailable.`);
    } else if (algorithmVersion < spectre.algorithm.first || algorithmVersion > spectre.algorithm.last) {
        throw new SpectreError("algorithmVersion", `Unsupported algorithm version: ${algorithmVersion}.`);
    } else if (!userName || !userName.length) {
        throw new SpectreError("userName", `Missing user name.`);
    } else if (!userSecret || !userSecret.length) {
        throw new SpectreError("userSecret", `Missing user secret.`);
    }

    try {
        let userSecretBytes = spectre.encoder.encode(userSecret);
        let userNameBytes = spectre.encoder.encode(userName);
        let keyPurpose = spectre.encoder.encode(spectre.purpose.authentication);

        // 1. Populate user salt: scope | #userName | userName
        let userSalt = new Uint8Array(keyPurpose.length + 4/*sizeof(uint32)*/ + userNameBytes.length);
        let userSaltView = new DataView(userSalt.buffer, userSalt.byteOffset, userSalt.byteLength);

        let uS = 0;
        userSalt.set(keyPurpose, uS);
        uS += keyPurpose.length;

        if (algorithmVersion < 3) {
            // V0, V1, V2 incorrectly used the character length instead of the byte length.
            userSaltView.setUint32(uS, userName.length, false/*big-endian*/);
            uS += 4/*sizeof(uint32)*/;
        } else {
            userSaltView.setUint32(uS, userNameBytes.length, false/*big-endian*/);
            uS += 4/*sizeof(uint32)*/;
        }

        userSalt.set(userNameBytes, uS);
        uS += userNameBytes.length;

        // 2. Derive user key from user secret and user salt.
        let userKeyData = await scrypt(userSecretBytes, userSalt, 32768, 8, 2, 64)
        let userKeyCrypto = await crypto.subtle.importKey("raw", userKeyData, {
            name: "HMAC", hash: {name: "SHA-256"}
        }, false, ["sign"])
        return ({keyCrypto: userKeyCrypto, keyAlgorithm: algorithmVersion})
    } catch (e) {
        throw e;
    }
});

spectre.newSiteKey = Object.freeze(async(userKey, siteName, keyCounter = spectre.counter.default,
    keyPurpose = spectre.purpose.authentication, keyContext = null) => {
    console.trace(`[spectre]: siteKey: ${siteName} (keyCounter=${keyCounter}, keyPurpose=${keyPurpose}, keyContext=${keyContext})`);

    if (!crypto.subtle) {
        throw new SpectreError("internal", `Cryptography unavailable.`);
    } else if (!userKey) {
        throw new SpectreError("userKey", `Missing user secret.`);
    } else if (!siteName || !siteName.length) {
        throw new SpectreError("siteName", `Missing site name.`);
    } else if (keyCounter < 1 || keyCounter > 4294967295/*Math.pow(2, 32) - 1*/) {
        throw new SpectreError("keyCounter", `Invalid counter value: ${keyCounter}.`);
    }

    try {
        let siteNameBytes = spectre.encoder.encode(siteName);
        let keyPurposeBytes = spectre.encoder.encode(keyPurpose);
        let keyContextBytes = keyContext && spectre.encoder.encode(keyContext);

        // 1. Populate site salt: keyPurpose | #siteName | siteName | keyCounter | #keyContext | keyContext
        let siteSalt = new Uint8Array(
            keyPurposeBytes.length
            + 4/*sizeof(uint32)*/ + siteNameBytes.length
            + 4/*sizeof(int32)*/
            + (keyContextBytes ? 4/*sizeof(uint32)*/ + keyContextBytes.length : 0)
        );
        let siteSaltView = new DataView(siteSalt.buffer, siteSalt.byteOffset, siteSalt.byteLength);

        let sS = 0;
        siteSalt.set(keyPurposeBytes, sS);
        sS += keyPurposeBytes.length;

        if (userKey.keyAlgorithm < 2) {
            // V0, V1 incorrectly used the character length instead of the byte length.
            siteSaltView.setUint32(sS, siteName.length, false/*big-endian*/);
            sS += 4/*sizeof(uint32)*/;
        } else {
            siteSaltView.setUint32(sS, siteNameBytes.length, false/*big-endian*/);
            sS += 4/*sizeof(uint32)*/;
        }

        siteSalt.set(siteNameBytes, sS);
        sS += siteNameBytes.length;

        siteSaltView.setInt32(sS, keyCounter, false/*big-endian*/);
        sS += 4/*sizeof(int32)*/;

        if (keyContextBytes) {
            siteSaltView.setUint32(sS, keyContextBytes.length, false/*big-endian*/);
            sS += 4/*sizeof(uint32)*/;

            siteSalt.set(keyContextBytes, sS);
            sS += keyContextBytes.length;
        }

        // 2. Derive site key from user key and site salt.
        let keyData = await crypto.subtle.sign({
            name: "HMAC", hash: {name: "SHA-256"}
        }, userKey.keyCrypto, siteSalt)
        return ({keyData: new Uint8Array(keyData), keyAlgorithm: userKey.keyAlgorithm})
    } catch (e) {
        throw e;
    }
});

spectre.newSiteResult = Object.freeze(async(userKey, siteName,
    resultType = spectre.resultType.defaultPassword, keyCounter = spectre.counter.default,
    keyPurpose = spectre.purpose.authentication, keyContext = null) => {
    console.trace(`[spectre]: result: ${siteName} (resultType=${resultType}, keyCounter=${keyCounter}, keyPurpose=${keyPurpose}, keyContext=${keyContext})`);

    // The seed words take a site key of their own: the purpose is fixed and the
    // context dropped, so the seed follows from name, secret, algorithm version,
    // site and counter, and shares no bytes with any password of the same site.
    // Why: a wallet seed has no rate limit and no reset, the chain is public, so
    // the master secret behind it must be long and random; the user accepted that.
    // Not the form's purpose because: the radio would silently become a wallet
    // input, and a leaked password of the site would reveal bytes of the seed.
    // Not the V0 byte quirk below because: that exists for template indexing only.
    // The result type arrives as a string from the form, hence the loose ==.
    // Frozen: once a real seed exists, any change here loses wallets. SEED-WORDS.md.
    if (resultType == spectre.resultType.deriveMnemonic) {
        let seedKey = await spectre.newSiteKey(userKey, siteName, keyCounter, spectre.purpose.seed, null)
        return spectre.newMnemonic(seedKey.keyData);
    }

    let siteKey = await spectre.newSiteKey(userKey, siteName, keyCounter, keyPurpose, keyContext)
    let siteKeyBytes = siteKey.keyData

    let resultTemplates = spectre.templates[resultType]
    if (!resultTemplates) {
        throw new SpectreError("resultType", `Unsupported result template: ${resultType}.`);
    }

    if (siteKey.keyAlgorithm < 1) {
        // V0 incorrectly converts bytes into 16-bit big-endian numbers.
        let siteKeyV0Bytes = new Uint16Array(siteKeyBytes.length);
        for (let sK = 0; sK < siteKeyV0Bytes.length; sK++) {
            siteKeyV0Bytes[sK] = (siteKeyBytes[sK] > 127 ? 0x00ff : 0x0000) | (siteKeyBytes[sK] << 8);
        }
        siteKeyBytes = siteKeyV0Bytes
    }

    // key byte 0 selects the template from the available result templates.
    let resultTemplate = resultTemplates[siteKeyBytes[0] % resultTemplates.length];

    // key byte 1+ selects a character from the template's character class.
    return resultTemplate.split("").map((characterClass, rT) => {
        let characters = spectre.characters[characterClass];
        return characters[siteKeyBytes[rT + 1] % characters.length];
    }).join("");
});

// Each letter or digit moves inside its own alphabet by a key value; every
// other character stays, so the masked text keeps the length and the shape of
// the code it hides. Unmask moves it back.
// Why: the user stores recovery codes on paper and wanted the masked text no
// longer than the code; a wrong secret, site or counter giving plausible
// garbage instead of an error was accepted for that.
// Not AES ("Own" in upstream Spectre) because: it is two to three times longer
// on paper, and no other Spectre client has to read these texts.
// One site and counter must mask one text only: two texts under the same key
// leak the difference between them.
// Only letters and digits take a key position. Why: a code copied back from
// paper with a lost space, dash or blank line would otherwise shift every
// later key value and unmask the rest as garbage, with no error.
// Frozen: once a masked code is on paper, any change here loses it. MASK.md.
const MASK_ALPHABETS = ["0123456789", "abcdefghijklmnopqrstuvwxyz", "ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
spectre.newMask = Object.freeze(async(userKey, siteName, keyCounter = spectre.counter.default, text = "", unmask = false) => {
    console.trace(`[spectre]: mask: ${siteName} (keyCounter=${keyCounter}, unmask=${unmask})`);

    let maskKey = await spectre.newSiteKey(userKey, siteName, keyCounter, spectre.purpose.mask, null)
    let streamKey = await crypto.subtle.importKey("raw", maskKey.keyData, {
        name: "HMAC", hash: {name: "SHA-256"}
    }, false, ["sign"])

    // Code points, not UTF-16 units: an emoji is one character, not two.
    let characters = Array.from(text);
    let alphabets = characters.map(character => MASK_ALPHABETS.find(alphabet => alphabet.includes(character)));
    let positions = alphabets.filter(alphabet => alphabet).length;

    // Key stream: HMAC-SHA-256(mask key, uint32be(block)), 32 bytes per block,
    // one big-endian uint16 per letter or digit. 16 bits keep the modulo bias
    // under 2^-11 for every alphabet.
    let stream = new Uint8Array(Math.ceil(positions * 2 / 32) * 32);
    for (let block = 0; block * 32 < stream.length; block++) {
        let index = new Uint8Array(4);
        new DataView(index.buffer).setUint32(0, block, false/*big-endian*/);
        stream.set(new Uint8Array(await crypto.subtle.sign("HMAC", streamKey, index)), block * 32);
    }
    let streamView = new DataView(stream.buffer);

    let p = 0;
    return characters.map((character, c) => {
        let alphabet = alphabets[c];
        if (!alphabet) {
            return character;
        }
        let shift = streamView.getUint16(p++ * 2, false/*big-endian*/) % alphabet.length;
        let position = alphabet.indexOf(character) + (unmask ? alphabet.length - shift : shift);
        return alphabet[position % alphabet.length];
    }).join("");
});

// Why: upstream keyed this HMAC with the raw secret, no scrypt in front, so
// the figure was a fast oracle on the secret: about 12 bits of it, checkable
// at hash speed by anyone who saw it. Signing with the user key instead costs
// one scrypt per guess, the same as the password. The key already binds the
// name, so a fixed message is enough; the message is distinct from every
// site salt, which all start with a purpose string followed by a length.
// Not a spectre.purpose entry because: a purpose is what a site key is
// derived under, and the test walks all of them; this message is signed once
// by the user key and never reaches newSiteKey.
const IDENTICON_MESSAGE = spectre.encoder.encode("com.lyndir.masterpassword.identicon");
spectre.newIdenticon = Object.freeze(async(userKey) => {
    console.trace(`[spectre]: identicon`);

    let seed = new Uint8Array(await crypto.subtle.sign("HMAC", userKey.keyCrypto, IDENTICON_MESSAGE))

    return {
        "leftArm": spectre.identicons.leftArm[seed[0] % spectre.identicons.leftArm.length],
        "body": spectre.identicons.body[seed[1] % spectre.identicons.body.length],
        "rightArm": spectre.identicons.rightArm[seed[2] % spectre.identicons.rightArm.length],
        "accessory": spectre.identicons.accessory[seed[3] % spectre.identicons.accessory.length],
        "color": spectre.identicons.accessory[seed[4] % spectre.identicons.color.length],
    }
});
