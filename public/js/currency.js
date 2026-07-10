document.addEventListener('alpine:init', () => {
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
