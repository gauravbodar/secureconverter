import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET;
const EXPIRES_IN = '7d';

if (!SECRET) {
  throw new Error('Missing JWT_SECRET environment variable.');
}

export function signToken(payload) {
  return jwt.sign(payload, SECRET, { algorithm: 'HS256', expiresIn: EXPIRES_IN });
}

export function verifyToken(token) {
  return new Promise((resolve, reject) => {
    jwt.verify(token, SECRET, { algorithms: ['HS256'] }, (err, decoded) => {
      if (err) reject(err);
      else resolve(decoded);
    });
  });
}
