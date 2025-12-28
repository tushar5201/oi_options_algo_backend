const axios = require("axios");
const logger = require("../utils/logger");
const config = require("../config/config");

class OIAnalyzer {
    async fetchOIData() {
        try {
            logger.info("Fetching OI data...");
            const res = await axios.get(config.api.nseOiUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json',
                    'Accept-Language': 'en-US,en;q=0.9'
                }
            });
            return res.data;
        } catch (error) {
            logger.error("OI fetch failed:", error.message);
            throw error;
        }
    }

    filterRiseInOIRise(oiData) {
        // ✅ FIXED: Direct array access
        return oiData['Rise-in-OI-Rise'] || [];
    }

    filterIndexOptions(data) {
        return data.filter(item => {
            // ✅ FIXED: Single return
            const isIndexOption = item.instrumentType === "OPTIDX";
            const isNiftyOrBanknifty = ["NIFTY", "BANKNIFTY"].includes(item.symbol);
            return isIndexOption && isNiftyOrBanknifty;
        });
    }

    getTopContracts(data, topN = 5) {
        return data
            .sort((a, b) => Math.abs(b.changeInOI) - Math.abs(a.changeInOI))
            .slice(0, topN);
    }

    selectCallAndPut(contracts) {
        const selected = [];
        const processed = new Set();

        for (const symbol of ["NIFTY", "BANKNIFTY"]) {
            const call = contracts.find(c =>
                c.symbol === symbol && c.optionType === "Call" && !processed.has(c.identifier)
            );
            if (call) {
                selected.push(call);
                processed.add(call.identifier);
            }

            const put = contracts.find(c =>
                c.symbol === symbol && c.optionType === "Put" && !processed.has(c.identifier)
            );
            if (put) {
                selected.push(put);
                processed.add(put.identifier);
            }

            if (selected.length >= config.options.maxSelection) break;
        }
        return selected;
    }

    async analyzeAndSelectOptions() {
        try {
            const oiData = await this.fetchOIData();
            const riseInOIRise = this.filterRiseInOIRise(oiData);
            const indexOptions = this.filterIndexOptions(riseInOIRise);
            const topContracts = this.getTopContracts(indexOptions, config.options.topN);
            const selectedOptions = this.selectCallAndPut(topContracts);

            logger.info(`Selected ${selectedOptions.length} options for trading`);
            return selectedOptions.map(this.convertToKotakFormat.bind(this));
        } catch (error) {
            logger.error("OI Analysis failed:", error.message);
            throw error;
        }
    }

    // Convert NSE data to Kotak trading format
    convertToKotakFormat(option) {
        const expiry = option.expiryDate.split('-').reverse().join('-');
        const optType = option.optionType === 'Call' ? 'CE' : 'PE';
        const strike = option.strikePrice;

        return {
            symbol: option.symbol,
            tradingSymbol: `${option.symbol}${expiry}${optType}${strike}`,
            strikePrice: strike,
            optionType: option.optionType,
            expiryDate: option.expiryDate,
            ltp: option.ltp,
            exchangeSegment: 'nse_fo',
            instrumentType: 'OPTIDX'
        };
    }
}

module.exports = new OIAnalyzer();
