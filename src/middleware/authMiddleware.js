import { jwtVerify } from "jose";

export const verifyToken = async (req, res, next) => {
  const authHeader = req.header("Authorization");

  if (!authHeader) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  // Extract token (handle Bearer prefix)
  const token = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : authHeader;

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const { payload: decoded } = await jwtVerify(token, new TextEncoder().encode(secret));
    req.user = decoded;
    next(); // Proceed to the next middleware or route
  } catch (error) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
};

// ✅ Add checkPremium Middleware
export const checkPremium = (req, res, next) => {
  if (req.user && req.user.isPremium) {
    next();
  } else {
    return res.status(403).json({ error: "Premium access required." });
  }
};
