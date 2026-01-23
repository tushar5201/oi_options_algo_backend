const { fetch61EMA60RSIStocks, fetchStocksAlternative } = require("../services/chartinkScanner.service");
const axios = require("axios");
const logger = require("../utils/logger");

class StockController {
    // Get top stocks from Chartink
    async getTopStocks(req, res) {
        try {
            logger.info('Fetching 61 EMA 60 RSI stocks from Chartink...');

            let stocks = await fetch61EMA60RSIStocks();

            if (!stocks || stocks.length === 0) {
                logger.info('Main method failed, trying alternative...');
                stocks = await fetchStocksAlternative();
            }

            logger.info(`Found ${stocks.length} stocks`);

            res.json({
                success: true,
                screener: '61-ema-60-rsi',
                count: stocks.length,
                data: stocks,
                lastUpdated: new Date().toISOString()
            });
        } catch (error) {
            logger.error('Error in /top-stocks:', error.message);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch stocks from Chartink',
                details: error.message
            });
        }
    }

    // Test Chartink connection
    async testChartink(req, res) {
        try {
            const scanClause = "( {cash} ( latest close > latest ema( close, 61 ) and latest rsi( 14 ) > 60 and latest rsi( 14 ) < 70 and latest sma( volume,10 ) > 100000 ) )";

            const response = await axios.post('https://chartink.com/screener/process',
                new URLSearchParams({ scan_clause: scanClause }).toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Accept': 'application/json, text/javascript, */*; q=0.01',
                        'X-Requested-With': 'XMLHttpRequest',
                        'Origin': 'https://chartink.com',
                        'Referer': 'https://chartink.com/screener',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Connection': 'keep-alive',
                        'Sec-Fetch-Dest': 'empty',
                        'Sec-Fetch-Mode': 'cors',
                        'Sec-Fetch-Site': 'same-origin',
                        'DNT': '1',
                        'Sec-GPC': '1'
                    }
                }
            );

            res.json({
                success: true,
                status: response.status,
                data: response.data
            });
        } catch (error) {
            logger.error('Test error:', error.response?.status || error.message);
            res.json({
                success: false,
                error: error.message,
                response: error.response?.data
            });
        }
    }
}

module.exports = new StockController();
