import axios from 'axios';
import * as cheerio from 'cheerio';
import {
    newAgent
} from './helper.js';
import randomUserAgent from 'random-useragent';
class TempMailClient {
    constructor(proxy = null) {
        this.baseUrl = "https://smailpro.com/app";
        this.inboxUrl = "https://app.sonjj.com/v1/temp_gmail";
        this.headers = {
            'accept': '*/*',
            'accept-language': 'en-US,en;q=0.9',
            'user-agent': randomUserAgent.getRandom(),
            'origin': 'https://smailpro.com',
            'referer': 'https://smailpro.com/'
        };
        this.proxy = proxy;
        this.agent = newAgent(this.proxy);
        this.emailAddress = null;
        this.key = null;
        this.payload = null;
    }

    async createEmail() {
        const url = `${this.baseUrl}/create`;
        const params = {
            username: 'random',
            type: 'alias',
            domain: 'gmail.com',
            server: '1'
        };

        let response = await axios.get(url, { params, headers: this.headers, httpsAgent: this.agent });
        while (!response.data) {
            response = await axios.get(url, { params, headers: this.headers, httpsAgent: this.agent });
        }
        const data = response.data;

        this.emailAddress = data.address;
        this.key = data.key;

        return data;
    }

    async createInbox() {
        const url = `${this.baseUrl}/inbox`;
        const payload = [{
            address: this.emailAddress,
            timestamp: Math.floor(Date.now() / 1000),
            key: this.key
        }];

        let response = await axios.post(url, payload, { headers: this.headers, httpsAgent: this.agent });
        while (!response.data) {
            response = await axios.get(url, { params, headers: this.headers, httpsAgent: this.agent });
        }
        const data = response.data;

        if (data.length > 0) {
            this.payload = data[0].payload;
        }

        return data[0];
    }

    async getInbox() {
        const url = `${this.inboxUrl}/inbox`;
        const params = { payload: this.payload };

        let response = await axios.get(url, { params, headers: this.headers, httpsAgent: this.agent });
        while (!response.data) {
            response = await axios.get(url, { params, headers: this.headers, httpsAgent: this.agent });
        }
        return response.data;
    }

    async getMessageToken(mid) {
        const url = `${this.baseUrl}/message`;
        const params = { email: this.emailAddress, mid };

        let response = await axios.get(url, { params, headers: this.headers, httpsAgent: this.agent });
        while (!response.data) {
            response = await axios.get(url, { params, headers: this.headers, httpsAgent: this.agent });
        }
        return response.data;
    }

    async getMessageContent(token) {
        const url = `${this.inboxUrl}/message`;
        const params = { payload: token };

        let response = await axios.get(url, { params, headers: this.headers, httpsAgent: this.agent });
        while (!response.data) {
            response = await axios.get(url, { params, headers: this.headers, httpsAgent: this.agent });
        }
        return response.data;
    }

    extractOtp(htmlContent) {
        try {
            const $ = cheerio.load(htmlContent);
            const otpElement = $('b').filter(function () {
                return $(this).attr('style') && $(this).attr('style').includes('letter-spacing:16px');
            });
            if (otpElement.length > 0) {
                return otpElement.text().trim();
            }
            return null;
        } catch (error) {
            console.error(`Error extracting OTP: ${error}`);
            return null;
        }
    }
}

export default TempMailClient;
