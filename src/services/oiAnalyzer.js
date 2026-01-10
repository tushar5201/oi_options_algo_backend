const axios = require("axios");
const logger = require("../utils/logger");
const config = require("../config/config");

class OIAnalyzer {

    async fetchOIData() {
        const res = await axios.get(config.api.nseOiUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0",
                "Accept": "application/json",
                "Referer": "https://www.nseindia.com"
            }
        });
        return res.data;
    }

    // ✅ FIX: Extract correct block
    extractRiseInOIRise(oiData) {
        if (!oiData?.data || !Array.isArray(oiData.data)) return [];

        const block = oiData.data.find(obj =>
            obj["Rise-in-OI-Rise"]
        );

        return block ? block["Rise-in-OI-Rise"] : [];
    }

    filterIndexOptions(data) {
        return data.filter(item =>
            item.instrumentType === "OPTIDX" &&
            ["NIFTY", "BANKNIFTY"].includes(item.symbol)
        );
    }

    getTopContracts(data, topN = 5) {
        return data
            .sort((a, b) => Math.abs(b.changeInOI) - Math.abs(a.changeInOI))
            .slice(0, topN);
    }

    selectCallAndPut(contracts) {
        const selected = [];
        const used = new Set();

        for (const sym of ["NIFTY", "BANKNIFTY"]) {
            const call = contracts.find(
                c => c.symbol === sym && c.optionType === "Call" && !used.has(c.identifier)
            );
            const put = contracts.find(
                c => c.symbol === sym && c.optionType === "Put" && !used.has(c.identifier)
            );

            if (call) {
                selected.push(call);
                used.add(call.identifier);
            }
            if (put) {
                selected.push(put);
                used.add(put.identifier);
            }
        }

        return selected;
    }

    async analyzeAndSelectOptions() {
        try {
            const oiData = await this.fetchOIData();

            const riseOI = this.extractRiseInOIRise(oiData);
            if (!riseOI.length) {
                logger.warn("⚠️ No Rise-in-OI-Rise data found");
                return [];
            }

            const indexOptions = this.filterIndexOptions(riseOI);
            const top = this.getTopContracts(indexOptions, config.options.topN);
            const selected = this.selectCallAndPut(top);

            logger.info(`✅ Selected ${selected.length} contracts`);
            return selected.map(this.convertToKotakFormat);

        } catch (err) {
            logger.error("OI Analysis failed:", err.message);
            throw err;
        }
    }

    convertToKotakFormat(option) {
        const expiry = option.expiryDate.split("-").reverse().join("-");
        const type = option.optionType === "Call" ? "CE" : "PE";

        return {
            symbol: option.symbol,
            tradingSymbol: `${option.symbol}${expiry}${type}${option.strikePrice}`,
            strikePrice: option.strikePrice,
            optionType: type,
            expiryDate: option.expiryDate,
            ltp: option.ltp,
            exchangeSegment: "nse_fo",
            instrumentType: "OPTIDX"
        };
    }
}

module.exports = new OIAnalyzer();
