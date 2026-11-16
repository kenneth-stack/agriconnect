import jwt from 'jsonwebtoken';

export const sign = (u) =>
  jwt.sign({ id: u.id, role: u.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

export function requireAuth(...roles) {
  return (req, res, next) => {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Please log in to continue.' });
    }
    if (roles.length && !roles.includes(req.user.role))
      return res.status(403).json({ error: 'Your account type cannot do this.' });
    next();
  };
}
