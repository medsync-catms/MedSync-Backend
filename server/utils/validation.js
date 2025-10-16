const validatePhoneNumber = (phone) => {
    if (!phone) return false;
    const phoneRegex = /^0\d{9}$/;
    return phoneRegex.test(phone);
};

module.exports = {
    validatePhoneNumber
};