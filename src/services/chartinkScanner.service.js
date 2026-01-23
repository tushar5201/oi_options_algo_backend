const axios = require("axios");
const cheerio = require("cheerio");

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

class ChartinkScraperService {
    constructor() {
        this.session = axios.create({
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
            }
        });
        this.csrfToken = null;
        this.cookies = null;
    }

    async initialize() {
        try {
            console.log('Initializing Chartink session...');

            const homeResponse = await this.session.get('https://chartink.com', {
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                }
            });

            this.cookies = this.extractCookies(homeResponse);

            const screenerResponse = await this.session.get('https://chartink.com/screener', {
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Cookie': this.cookies
                }
            });

            this.cookies = this.extractCookies(screenerResponse) || this.cookies;
            this.csrfToken = this.extractCsrfToken(screenerResponse.data);

            if (!this.csrfToken) {
                console.warn('No CSRF token found, trying alternative method...');
            }

            console.log('Chartink session initialized');
            return true;
        } catch (error) {
            console.error('Failed to initialize Chartink session:', error.message);
            return false;
        }
    }

    extractCookies(response) {
        if (response.headers['set-cookie']) {
            return response.headers['set-cookie']
                .map(cookie => cookie.split(';')[0])
                .join('; ');
        }
        return null;
    }

    extractCsrfToken(html) {
        try {
            const $ = cheerio.load(html);

            let csrfToken = $('meta[name="csrf-token"]').attr('content');

            if (!csrfToken) {
                const scripts = $('script');
                for (let i = 0; i < scripts.length; i++) {
                    const scriptContent = $(scripts[i]).html();
                    if (scriptContent && scriptContent.includes('csrfToken')) {
                        const match = scriptContent.match(/csrfToken\s*[:=]\s*['"]([^'"]+)['"]/);
                        if (match) {
                            csrfToken = match[1];
                            break;
                        }
                    }
                }
            }

            if (csrfToken) {
                console.log('CSRF token found:', csrfToken.substring(0, 20) + '...');
            }

            return csrfToken;
        } catch (error) {
            console.error('Error extracting CSRF token:', error.message);
            return null;
        }
    }

    async fetch61EMA60RSIStocks() {
        try {
            if (!this.csrfToken) {
                await this.initialize();
            }

            const scanClause = "( {cash} ( latest close > latest ema( close, 61 ) and latest rsi( 14 ) > 60 and latest rsi( 14 ) < 70 and latest sma( volume,10 ) > 100000 ) )";

            console.log('Making API request with CSRF protection...');

            const headers = {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'Origin': 'https://chartink.com',
                'Referer': 'https://chartink.com/screener',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            };

            if (this.csrfToken) {
                headers['X-CSRF-TOKEN'] = this.csrfToken;
            }

            if (this.cookies) {
                headers['Cookie'] = this.cookies;
            }

            const formData = new URLSearchParams();
            formData.append('scan_clause', scanClause);

            await delay(2000);

            const response = await this.session.post('https://chartink.com/screener/process',
                formData.toString(),
                {
                    headers: headers,
                    maxRedirects: 0
                }
            );

            console.log('API Response status:', response.status);

            if (response.data && response.data.data) {
                const stocks = this.formatStocks(response.data.data);
                console.log(`Successfully fetched ${stocks.length} stocks`);
                return stocks;
            }

            console.log('No data in response');
            return [];
        } catch (error) {
            console.error('Error in fetch61EMA60RSIStocks:', error.message);

            if (error.response) {
                console.error('Response status:', error.response.status);
                console.error('Response data:', error.response.data);

                if (error.response.status === 419) {
                    console.log('CSRF error detected, reinitializing session...');
                    await this.initialize();
                    return await this.fetch61EMA60RSIStocks();
                }
            }

            return [];
        }
    }

    formatStocks(data) {
        return data.map(item => ({
            symbol: item.nsecode || item.symbol || 'N/A',
            name: item.name || item.company_name || 'N/A',
            close: parseFloat(item.close) || 0,
            change: parseFloat(item.per_chg) || 0,
            volume: parseInt(item.volume) || 0,
            rsi: parseFloat(item.rsi_14) || 0,
            ema_61: parseFloat(item.ema_61) || 0,
            sector: item.sector || 'N/A',
            market_cap: item.market_cap || 'N/A',
            sma_volume_10: parseInt(item.sma_volume_10) || 0,
            exchange: item.exchange || 'NSE'
        }));
    }

    async fetchStocksAlternative() {
        try {
            console.log('Trying alternative method...');

            const scanClause = "( {cash} ( latest close > latest ema( close, 61 ) and latest rsi( 14 ) > 60 and latest rsi( 14 ) < 70 and latest sma( volume,10 ) > 100000 ) )";

            const response = await this.session.get('https://chartink.com/screener/data', {
                params: {
                    f: scanClause,
                    page: 1,
                    per_page: 100
                },
                headers: {
                    'Accept': 'application/json',
                    'Referer': 'https://chartink.com/screener',
                    'Cookie': this.cookies
                }
            });

            if (response.data && response.data.data) {
                return this.formatStocks(response.data.data);
            }

            return [];
        } catch (error) {
            console.error('Alternative method error:', error.message);
            return [];
        }
    }
}

const chartinkScraperService = new ChartinkScraperService();
chartinkScraperService.initialize().catch(console.error);

async function fetch61EMA60RSIStocks() {
    return await chartinkScraperService.fetch61EMA60RSIStocks();
}

async function fetchStocksAlternative() {
    return await chartinkScraperService.fetchStocksAlternative();
}

module.exports = {
    fetch61EMA60RSIStocks,
    fetchStocksAlternative
};
