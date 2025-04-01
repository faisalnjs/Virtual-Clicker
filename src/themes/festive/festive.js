try {
    import "./festive.css";
} catch (error) {
  if (storage.get("developer")) {
    alert('Error @ festive.js:', error.message);
  };
  throw error;
};