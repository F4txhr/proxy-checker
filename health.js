export default async function handler(req, res) {
  res.status(200).json({ 
    status: "healthy",
    message: "API is working!",
    timestamp: new Date().toISOString()
  });
}
