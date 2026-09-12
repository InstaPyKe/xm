document.addEventListener('alpine:init', () => {
    // 1. Theme Manager Store
    Alpine.store('theme', {
        lightMode: localStorage.getItem('xm_theme') === 'light',
        init() {
            if (this.lightMode) {
                document.documentElement.classList.add('theme-light');
                if (document.body) {
                    document.body.classList.add('theme-light');
                } else {
                    document.addEventListener('DOMContentLoaded', () => {
                        document.body.classList.add('theme-light');
                    });
                }
            }
        },
        toggle() {
            this.lightMode = !this.lightMode;
            if (this.lightMode) {
                document.documentElement.classList.add('theme-light');
                document.body.classList.add('theme-light');
                localStorage.setItem('xm_theme', 'light');
            } else {
                document.documentElement.classList.remove('theme-light');
                document.body.classList.remove('theme-light');
                localStorage.setItem('xm_theme', 'dark');
            }
        }
    });

    // 2. Currency Switcher Store
    Alpine.store('currency', {
        current: localStorage.getItem('xm_currency') || 'KSh',
        rate: 130, // 1 USD = 130 KES
        toggle() {
            this.current = this.current === 'USD' ? 'KSh' : 'USD';
            localStorage.setItem('xm_currency', this.current);
            window.dispatchEvent(new CustomEvent('currency-changed', { detail: this.current }));
        },
        format(valInKES) {
            const num = parseFloat(valInKES);
            if (isNaN(num)) return 'KSh 0.00';
            if (this.current === 'USD') {
                return '$' + (num / this.rate).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
            }
            return 'KSh ' + num.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
        },
        formatUSD(valInUSD) {
            const num = parseFloat(valInUSD);
            if (isNaN(num)) return '$0';
            if (this.current === 'KSh') {
                return 'KSh ' + (num * this.rate).toLocaleString('en-US', {minimumFractionDigits: 0});
            }
            return '$' + num.toLocaleString('en-US', {minimumFractionDigits: 0});
        }
    });
});
