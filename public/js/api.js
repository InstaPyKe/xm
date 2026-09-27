/**
 * XM Digital Platform - Unified API & Asset Resolver
 * Works seamlessly across Cloudflare Pages (Frontend) and Railway (Backend & Database).
 */
(function (window) {
    'use strict';

    // 1. Resolve Backend Base URL
    function getApiBaseUrl() {
        // Priority 1: Explicit global override in HTML or environment
        if (window.XM_API_BASE && typeof window.XM_API_BASE === 'string' && window.XM_API_BASE.trim()) {
            return window.XM_API_BASE.replace(/\/+$/, '');
        }

        // Priority 2: User / Admin runtime override stored in localStorage
        const storedUrl = localStorage.getItem('xm_api_url');
        if (storedUrl && storedUrl.trim()) {
            return storedUrl.trim().replace(/\/+$/, '');
        }

        // Priority 3: Local development ports detection
        const hostname = window.location.hostname;
        const port = window.location.port;

        // If running frontend on a dev server (e.g. port 3000, 5173, 8080, Live Server 5500)
        if ((hostname === 'localhost' || hostname === '127.0.0.1') && port && port !== '5000') {
            return 'http://localhost:5000';
        }

        // If running directly on Express backend port 5000 or using relative Cloudflare proxy
        return '';
    }

    // 2. Generate Full API URL
    function apiUrl(path) {
        if (!path) return getApiBaseUrl();
        // If already an absolute URL
        if (path.startsWith('http://') || path.startsWith('https://')) {
            return path;
        }
        const base = getApiBaseUrl();
        const cleanPath = path.startsWith('/') ? path : '/' + path;
        return base ? `${base}${cleanPath}` : cleanPath;
    }

    // 3. Resolve Media & Uploaded Image URLs
    function resolveImageUrl(imagePath, fallback) {
        const defaultFallback = fallback || 'https://images.unsplash.com/photo-1591488320449-011701bb6704?w=800&auto=format&fit=crop&q=80';
        if (!imagePath || typeof imagePath !== 'string' || !imagePath.trim()) {
            return defaultFallback;
        }
        
        const path = imagePath.trim();
        
        // Remote URLs or data URLs
        if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
            return path;
        }

        // Relative uploaded file paths (e.g. /public/uploads/..., uploads/..., /uploads/...)
        const base = getApiBaseUrl();
        const cleanPath = path.startsWith('/') ? path : '/' + path;
        
        if (base) {
            return `${base}${cleanPath}`;
        }
        return cleanPath;
    }

    // 4. Universal Fetch Wrapper with Token Injection & Error Handling
    async function apiFetch(path, options = {}) {
        const url = apiUrl(path);
        const headers = new Headers(options.headers || {});

        // Attach Authorization token if available and not explicitly provided
        if (!headers.has('Authorization')) {
            const userToken = localStorage.getItem('xm_jwt_token');
            const adminToken = localStorage.getItem('xm_admin_token');
            
            // Check if path is admin endpoint vs user endpoint
            if (path.includes('/admin') && adminToken) {
                headers.set('Authorization', `Bearer ${adminToken}`);
            } else if (userToken) {
                headers.set('Authorization', `Bearer ${userToken}`);
            } else if (adminToken) {
                headers.set('Authorization', `Bearer ${adminToken}`);
            }
        }

        // Set default Content-Type for JSON payloads if not a FormData object
        if (!(options.body instanceof FormData)) {
            if (!headers.has('Content-Type') && options.method && options.method.toUpperCase() !== 'GET' && options.method.toUpperCase() !== 'HEAD') {
                headers.set('Content-Type', 'application/json');
            }
            if (!headers.has('Accept')) {
                headers.set('Accept', 'application/json');
            }
        }

        const fetchConfig = {
            ...options,
            headers,
            credentials: options.credentials || 'include'
        };

        try {
            const response = await fetch(url, fetchConfig);
            
            // Auto handle 401 Unauthorized for protected pages
            if (response.status === 401) {
                const isProtectedUserPage = window.location.pathname.includes('/account/');
                const isProtectedAdminPage = window.location.pathname.includes('/admin/') && !window.location.pathname.includes('login');
                
                if (isProtectedUserPage) {
                    localStorage.removeItem('xm_jwt_token');
                    if (!window.location.pathname.includes('signin')) {
                        window.location.href = '/public/signin.html?session=expired';
                    }
                } else if (isProtectedAdminPage) {
                    localStorage.removeItem('xm_admin_token');
                    if (!window.location.pathname.includes('admin-login')) {
                        window.location.href = '/admin/admin-login.html?session=expired';
                    }
                }
            }

            return response;
        } catch (error) {
            console.error(`🚨 XM API Network Error (${url}):`, error);
            throw error;
        }
    }

    // 5. Helper to programmatically configure API target at runtime
    function setApiUrl(newUrl) {
        if (!newUrl) {
            localStorage.removeItem('xm_api_url');
        } else {
            localStorage.setItem('xm_api_url', newUrl.trim().replace(/\/+$/, ''));
        }
    }

    // Export globally to window
    window.getApiBaseUrl = getApiBaseUrl;
    window.apiUrl = apiUrl;
    window.resolveImageUrl = resolveImageUrl;
    window.apiFetch = apiFetch;
    window.setApiUrl = setApiUrl;

    window.XM_API = {
        getBaseUrl: getApiBaseUrl,
        apiUrl: apiUrl,
        resolveImageUrl: resolveImageUrl,
        apiFetch: apiFetch,
        setApiUrl: setApiUrl
    };

})(typeof window !== 'undefined' ? window : this);
