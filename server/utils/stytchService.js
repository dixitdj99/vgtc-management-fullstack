const axios = require('axios');

// Read Stytch Configuration from environment
const STYTCH_PROJECT_ID = process.env.STYTCH_PROJECT_ID || '';
const STYTCH_SECRET = process.env.STYTCH_SECRET || '';
const STYTCH_API_URL = process.env.STYTCH_API_URL || 'https://test.stytch.com';

const isStytchConfigured = () => {
    return STYTCH_PROJECT_ID && 
           STYTCH_SECRET && 
           !STYTCH_PROJECT_ID.includes('00000000') &&
           !STYTCH_SECRET.includes('00000000');
};

const getAuthHeader = () => {
    const creds = `${STYTCH_PROJECT_ID}:${STYTCH_SECRET}`;
    return `Basic ${Buffer.from(creds).toString('base64')}`;
};

const signup = async (email, password) => {
    if (!isStytchConfigured()) {
        console.warn('[Stytch] WARNING: Using simulated signup because Stytch credentials are not configured.');
        return { user_id: 'mock-stytch-user-' + Math.random().toString(36).substr(2, 9) };
    }
    
    try {
        const response = await axios.post(`${STYTCH_API_URL}/v1/passwords`, {
            email,
            password
        }, {
            headers: {
                'Authorization': getAuthHeader(),
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (err) {
        console.error('[Stytch] Signup error:', err.response?.data || err.message);
        throw new Error(err.response?.data?.error_message || 'Stytch signup failed');
    }
};

const authenticate = async (email, password) => {
    if (!isStytchConfigured()) {
        console.warn('[Stytch] WARNING: Using simulated authentication because Stytch credentials are not configured.');
        return { user_id: 'mock-stytch-user-auth' };
    }
    
    try {
        const response = await axios.post(`${STYTCH_API_URL}/v1/passwords/authenticate`, {
            email,
            password
        }, {
            headers: {
                'Authorization': getAuthHeader(),
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (err) {
        console.error('[Stytch] Authenticate error:', err.response?.data || err.message);
        throw new Error(err.response?.data?.error_message || 'Stytch authentication failed');
    }
};

const resetPasswordStart = async (email, resetPasswordRedirectUrl) => {
    if (!isStytchConfigured()) {
        console.warn('[Stytch] WARNING: Using simulated resetPasswordStart because Stytch credentials are not configured.');
        return { message: 'Reset link sent (simulated)' };
    }
    
    try {
        const response = await axios.post(`${STYTCH_API_URL}/v1/passwords/email/reset/start`, {
            email,
            reset_password_redirect_url: resetPasswordRedirectUrl
        }, {
            headers: {
                'Authorization': getAuthHeader(),
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (err) {
        console.error('[Stytch] ResetPasswordStart error:', err.response?.data || err.message);
        throw new Error(err.response?.data?.error_message || 'Stytch password reset initiation failed');
    }
};

const resetPasswordComplete = async (token, newPassword) => {
    if (!isStytchConfigured()) {
        console.warn('[Stytch] WARNING: Using simulated resetPasswordComplete because Stytch credentials are not configured.');
        return { user_id: 'mock-stytch-user-reset' };
    }
    
    try {
        const response = await axios.post(`${STYTCH_API_URL}/v1/passwords/email/reset`, {
            token,
            password: newPassword
        }, {
            headers: {
                'Authorization': getAuthHeader(),
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (err) {
        console.error('[Stytch] ResetPasswordComplete error:', err.response?.data || err.message);
        throw new Error(err.response?.data?.error_message || 'Stytch password reset completion failed');
    }
};

const sendEmailOTP = async (email) => {
    if (!isStytchConfigured()) {
        console.warn('[Stytch] WARNING: Using simulated OTP send because Stytch credentials are not configured.');
        return { method_id: 'mock-otp-method-' + Math.random().toString(36).substr(2, 9) };
    }
    
    try {
        const response = await axios.post(`${STYTCH_API_URL}/v1/otps/email/login_or_create`, {
            email,
            expiration_minutes: 10
        }, {
            headers: {
                'Authorization': getAuthHeader(),
                'Content-Type': 'application/json'
            }
        });
        return {
            ...response.data,
            method_id: response.data.email_id
        };
    } catch (err) {
        console.error('[Stytch] Send OTP error:', err.response?.data || err.message);
        throw new Error(err.response?.data?.error_message || 'Stytch OTP send failed');
    }
};

const authenticateOTP = async (methodId, code) => {
    if (!isStytchConfigured()) {
        console.warn('[Stytch] WARNING: Using simulated OTP authentication.');
        if (code === '123456') {
            return { user_id: 'mock-user-otp-auth' };
        }
        throw new Error('Invalid mock OTP code');
    }
    
    try {
        const response = await axios.post(`${STYTCH_API_URL}/v1/otps/authenticate`, {
            method_id: methodId,
            code
        }, {
            headers: {
                'Authorization': getAuthHeader(),
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (err) {
        console.error('[Stytch] Authenticate OTP error:', err.response?.data || err.message);
        throw new Error(err.response?.data?.error_message || 'Stytch OTP verification failed');
    }
};

const searchUserByEmail = async (email) => {
    if (!isStytchConfigured()) {
        return null;
    }
    try {
        const response = await axios.post(`${STYTCH_API_URL}/v1/users/search`, {
            query: {
                operator: 'AND',
                operands: [
                    {
                        filter_name: 'email_address',
                        filter_value: [email]
                    }
                ]
            }
        }, {
            headers: {
                'Authorization': getAuthHeader(),
                'Content-Type': 'application/json'
            }
        });
        const results = response.data.results || [];
        if (results.length > 0) {
            return results[0];
        }
        return null;
    } catch (err) {
        console.error('[Stytch] Search user error:', err.response?.data || err.message);
        throw new Error(err.response?.data?.error_message || 'Stytch search user failed');
    }
};

const deleteUserPassword = async (userId, passwordId) => {
    if (!isStytchConfigured()) {
        return;
    }
    try {
        await axios.delete(`${STYTCH_API_URL}/v1/users/passwords/${passwordId}`, {
            headers: {
                'Authorization': getAuthHeader()
            }
        });
    } catch (err) {
        console.error('[Stytch] Delete password error:', err.response?.data || err.message);
        throw new Error(err.response?.data?.error_message || 'Stytch delete password failed');
    }
};

const migratePassword = async (email, hash) => {
    if (!isStytchConfigured()) {
        console.warn('[Stytch] WARNING: Using simulated migratePassword because Stytch credentials are not configured.');
        return { user_id: 'mock-stytch-user-migrate' };
    }
    
    try {
        const response = await axios.post(`${STYTCH_API_URL}/v1/passwords/migrate`, {
            email,
            hash,
            hash_type: 'bcrypt'
        }, {
            headers: {
                'Authorization': getAuthHeader(),
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (err) {
        console.error('[Stytch] MigratePassword error:', err.response?.data || err.message);
        throw new Error(err.response?.data?.error_message || 'Stytch password migration failed');
    }
};

module.exports = {
    isStytchConfigured,
    signup,
    authenticate,
    resetPasswordStart,
    resetPasswordComplete,
    sendEmailOTP,
    authenticateOTP,
    migratePassword,
    searchUserByEmail,
    deleteUserPassword
};
