const crypto = require('crypto');

function a(stringBuffer, b10) {
  stringBuffer.push("0123456789ABCDEF".charAt((b10 >> 4) & 15));
  stringBuffer.push("0123456789ABCDEF".charAt(b10 & 0x0F));
}

function b(clientCode, hashedPassword) {
  return c(Buffer.from(clientCode, 'utf8'), Buffer.from(hashedPassword, 'utf8'));
}

function c(bArr, bArr2) {
  const hash = crypto.createHash('md5').update(bArr).digest();
  const secretKeySpec = crypto.createCipheriv('aes-128-ecb', hash, null);
  const encryptedData = secretKeySpec.update(bArr2);
  const finalBuffer = Buffer.concat([encryptedData, secretKeySpec.final()]);
  return d(finalBuffer);
}

function d(bArr) {
  if (bArr === null) {
    return "";
  }
  const stringBuffer = [];
  for (const b10 of bArr) {
    a(stringBuffer, b10);
  }
  return stringBuffer.join("").toLowerCase();
}

function getHashedPassword(password, uid) {
  const data = (uid + password + "@uhooinc.com");
  const sha256 = crypto.createHash('sha256');
  const digest = sha256.update(data, 'utf8').digest();
  let hexString = '';
  for (const b10 of digest) {
    const value = b10 & 0xFF;
    hexString += value.toString(16).padStart(2, '0');
  }
  return hexString;
}

function getEncryptedPassword(password, uid, clientCode) {
  return b(clientCode, getHashedPassword(password, uid));
}


module.exports = { getEncryptedPassword };
