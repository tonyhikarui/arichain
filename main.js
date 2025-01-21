import FormData from 'form-data';
import axios from 'axios';
import log from './utils/logger.js'
import beddus from './utils/banner.js'
import TempMailClient from './utils/mail.js';
import {
    delay,
    saveToFile,
    newAgent,
    readFile
} from './utils/helper.js';
import readline from 'readline';

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
        log.error('Error When Sending OTP got error code:', error.message);
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
        log.error(`Error when registering got error code:`, error.status);
        return null;
    }
}

function generatePassword(length = 12) {
    const uppercaseLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercaseLetters = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const specialCharacters = '!@#$%^&*()_+[]{}|;:,.<>?';

    const allCharacters = uppercaseLetters + lowercaseLetters + numbers + specialCharacters;

    let password = '';
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * allCharacters.length);
        password += allCharacters[randomIndex];
    }

    return password;
}

async function main() {
    log.info(beddus)
    await delay(3)

    const proxies = await readFile("proxy.txt")
    if (proxies.length === 0) {
        log.warn(`Running without proxy...`);
    }

    let proxyIndex = 0
    const invite_code = await getInviteCode() // `678b90d462361`
    log.warn(`Starting Running Program [ CTRL + C ] to exit...`)

    while (true) {
        try {
            const proxy = proxies[proxyIndex] || null;
            proxyIndex = (proxyIndex + 1) % proxies.length
            log.info('Creating email and Register Using Proxy:', proxy || "without proxy");
            const tempMailClient = new TempMailClient(proxy);

            let emailData = await tempMailClient.createEmail();
            while (!emailData?.address) {
                log.warn('Failed To Generate New Email, Retrying...');
                await delay(3)
                emailData = await tempMailClient.createEmail();
            }

            const email = emailData.address;
            const password = generatePassword(12);

            log.info('Trying to register email:', `${email} with invited Code: ${invite_code}`);

            let sendingOtp = await sendOtp(email, proxy);
            while (!sendingOtp) {
                log.warn('Failed to send OTP, Retrying...');
                await delay(3)
                sendingOtp = await sendOtp(email, proxy);
            }

            log.info('Checking Otp For Email:', email);
            await tempMailClient.createInbox();
            let inboxMessages = await tempMailClient.getInbox();
            while (inboxMessages.messages.length === 0) {
                log.warn('No Otp Found, Rechecking in 3 seconds...');
                await delay(3)
                inboxMessages = await tempMailClient.getInbox();
            }

            if (inboxMessages.messages.length > 0) {
                const message = inboxMessages.messages[0];
                const messageToken = await tempMailClient.getMessageToken(message.mid);
                const messageContent = await tempMailClient.getMessageContent(messageToken);

                const otp = tempMailClient.extractOtp(messageContent.body);
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
                    await saveToFile('accounts.txt', `${email}|${password}`)
                }
            } else {
                console.log('No messages found in the inbox.');
            }

        } catch (error) {
            log.error(`Error when registering:`, error.message);
        }
        await delay(3)
    }
}

main()