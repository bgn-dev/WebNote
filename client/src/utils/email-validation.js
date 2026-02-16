/**
 * Validates if a string is a valid email address
 * @param {string} email - The email string to validate
 * @returns {boolean} - True if valid email, false otherwise
 */
export const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') {
    return false;
  }

  // Basic email regex pattern
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  // Additional checks for edge cases
  const trimmedEmail = email.trim();
  
  // Check basic pattern
  if (!emailRegex.test(trimmedEmail)) {
    return false;
  }
  
  // Check for common invalid patterns
  if (trimmedEmail.includes('..') || // consecutive dots
      trimmedEmail.startsWith('.') || // starts with dot
      trimmedEmail.endsWith('.') ||   // ends with dot
      trimmedEmail.includes('@.') ||  // dot immediately after @
      trimmedEmail.includes('.@')) {  // dot immediately before @
    return false;
  }
  
  return true;
};

/**
 * More comprehensive email validation using HTML5 input validation
 * @param {string} email - The email string to validate
 * @returns {boolean} - True if valid email, false otherwise
 */
export const isValidEmailStrict = (email) => {
  if (!email || typeof email !== 'string') {
    return false;
  }

  // Create a temporary input element for HTML5 validation
  const input = document.createElement('input');
  input.type = 'email';
  input.value = email.trim();
  
  return input.validity.valid && input.value.length > 0;
};