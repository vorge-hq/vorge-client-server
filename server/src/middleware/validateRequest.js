function validateRequest(schema) {
  return (req, res, next) => {
    const result = schema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query
    });

    if (!result.success) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          issues: result.error.issues
        }
      });
    }

    req.validated = result.data;
    return next();
  };
}

module.exports = validateRequest;
