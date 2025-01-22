import Mailjs from '@cemalgnlts/mailjs';
import FormData from 'form-data';
import axios from 'axios';
import log from './utils/logger.js'
import beddus from './utils/banner.js'
import {
    delay,
    saveToFile,
    newAgent,
    readFile
} from './utils/helper.js';
import readline from 'readline';

const MAX_RETRIES = 20;
const RETRY_DELAY = 5000;

function getInviteCode() {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        rl.question('Enter your invite code: ', (code) => {
            rl.close();
            resolve(code);
        });
    });
}

const mailjs = new Mailjs();

async function sendOtp(email, proxy) {
    const agent = newAgent(proxy);
    const form = new FormData();
    form.append('email', email);
    form.append('ci_csrf_token', '');

    const headers = {
        ...form.getHeaders(),
    };

    try {
        const response = await axios.post('https://arichain.io/api/Email/send_valid_email', form, {
            headers: headers,
            httpsAgent: agent,
        });
        log.info('Sending OTP Result:', response.data);
        return response.data;
    } catch (error) {
        log.error('Error When Sending OTP got error code:', error.status);
        return null;
    }
}

async function checkCode(email, code, proxy) {
    const agent = newAgent(proxy);
    const form = new FormData();
    form.append('email', email);
    form.append('code', code);
    form.append('ci_csrf_token', '');

    const headers = {
        ...form.getHeaders(),
    };

    try {
        const response = await axios.post('https://arichain.io/api/Email/check_valid_code', form, {
            headers: headers,
            httpsAgent: agent,
        });
        log.info('Checking valid code Result:', response.data);
        return code;
    } catch (error) {
        log.error('Error when checking got error code:', error.status);
        return code;
    }
}

async function register(email, pw, pw_re, valid_code, invite_code, proxy) {
    const agent = newAgent(proxy);
    const form = new FormData();
    form.append('email', email);
    form.append('pw', pw);
    form.append('pw_re', pw_re);
    form.append('valid_code', valid_code);
    form.append('invite_code', invite_code);
    form.append('ci_csrf_token', '');

    const headers = {
        ...form.getHeaders(),
    };

    try {
        const response = await axios.post('https://arichain.io/api/Account/signup', form, {
            headers: headers,
            httpsAgent: agent,
        });
        log.info('Register Result:', response.data);
        return response.data;
    } catch (error) {
        log.error(`Error when registering ${email} got error code:`, error.status);
        return null;
    }
}

async function waitForEmail(mailjs, retries = MAX_RETRIES, delay = RETRY_DELAY) {
    for (let i = 0; i < retries; i++) {
        try {
            const messages = await mailjs.getMessages();
            if (messages.data.length > 0) {
                const message = messages.data[0];
                const fullMessage = await mailjs.getMessage(message.id);

                const match = fullMessage.data.text.match(/Please complete the email address verification with this code.\s+Thank you.\s+(\d{6})/);
                if (match) {
                    log.info(`OTP found on attempt ${i + 1}`);
                    return match[1];
                }
            }
            log.warn(`Attempt ${i + 1}/${retries}: No OTP email found yet`);
        } catch (error) {
            log.warn(`Attempt ${i + 1}/${retries} failed: ${error.message}`);
        }
        if (i < retries - 1) await new Promise(resolve => setTimeout(resolve, delay));
    }
    throw new Error(`Failed to receive OTP email after ${retries} attempts`);
}

async function main() {
    log.info(beddus)
    await delay(3)

    const proxies = await readFile("proxy.txt")
    if (proxies.length === 0) {
        log.warn(`Running without proxy...`);
    }

    let index = 0;  // Single index for both task and proxy tracking
    const invite_code = "678d1bfc5f6df";
    log.warn(`Starting Running Program [ CTRL + C ] to exit...`)

    while (true) {
        let email = null;
        let mailAccount = null;
        
        try {
            const proxy = proxies[index] || null;
            log.info(`Starting Task/Proxy #${index + 1}/${proxies.length || 1}`);
            
            index = (index + 1) % (proxies.length || 1);  // Cycle through proxies
            
            let account = await mailjs.createOneAccount();
            while (!account?.data?.username) {
                log.warn('Failed To Generate New Email, Retrying...');
                await delay(3)
                account = await mailjs.createOneAccount();
            }

            email = account.data.username;  // Assign value to email
            const pass = account.data.password;
            const password = `${pass}Ari321#`

            log.info('Trying to register email:', `${email} with invited Code: ${invite_code}`);
            log.info('Register Using Proxy:', proxy || "without proxy");

            let otpReceived = false;
            let attempts = 0;
            
            while (!otpReceived && attempts < 3) {
                try {
                    let sendingOtp = await sendOtp(email, proxy);
                    if (!sendingOtp) {
                        throw new Error('Failed to send OTP');
                    }

                    await mailjs.login(email, password);
                    const otp = await waitForEmail(mailjs);
                    
                    if (otp) {
                        log.info(`Email ${email} received OTP:`, otp);
                        const valid_code = await checkCode(email, otp, proxy);
                        
                        if (valid_code) {
                            let response = await register(
                                email,
                                password,
                                password,
                                valid_code,
                                invite_code,
                                proxy
                            );
                            while (!response) {
                                log.warn(`Failed to registering ${email}, retrying...`)
                                await delay(1)
                                response = await register(
                                    email,
                                    password,
                                    password,
                                    valid_code,
                                    invite_code,
                                    proxy
                                );
                            }
                            
                            // Save original format to accounts.txt
                            await saveToFile('accounts.txt', `${email}|${password}`);
                            
                            // Save extended info to separate file
                            if (response.status === "success" && response.result) {
                                const detailedInfo = `${response.result.address}|${response.result.master_key}|${response.result.invite_code}`;
                                await saveToFile('accounts_info.txt', detailedInfo);
                                log.info(`Additional account info saved to accounts_info.txt`);
                            }
                            otpReceived = true;
                        }
                    }
                } catch (error) {
                    attempts++;
                    log.warn(`OTP attempt ${attempts}/3 failed: ${error.message}`);
                    await delay(3);
                }
            }

            if (!otpReceived) {
                throw new Error('Maximum OTP attempts reached, skipping to next account');
            }

        } catch (error) {
            log.error(`Task #${index} Error when registering ${email}:`, error.message);
        } finally {
            if (mailAccount) {
                try {
                    await mailjs.logout();
                } catch (e) {
                    log.warn('Failed to logout mail session');
                }
            }
        }
        await delay(3)
    }
}

main()