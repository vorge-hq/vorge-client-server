class DomainError extends Error {
  constructor(message, status = 400, code = "DOMAIN_ERROR", details = {}) {
    super(message);
    this.name = "DomainError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

module.exports = {
  DomainError
};
