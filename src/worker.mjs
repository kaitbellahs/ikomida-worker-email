#!/usr/bin/env node

import {
    objHasProp,
    RabbitMQ,
    GateWays,
    Logger
} from 'ikomida-shared';
import Mailjet from 'node-mailjet';
import {
    createRequire
} from "module";
const require = createRequire(
    import.meta.url);
let {
    name
} = require("../package.json");
name = name
    .replace(/^(@\S+\/)?(svelte-)?(\S+)/, '$3')
    .replace(/^\w/, m => m.toUpperCase())
    .replace(/-\w/g, m => m[1].toUpperCase());
const logger = Logger.getInstance(name, process.env?.ENV !== 'PROD');

class EmailWorker {

    googleAdmin;
    amqp;
    provider;

    //TODO: -- report errors
    async run() {
        try {
            this.amqp = new RabbitMQ(logger);
            this.provider = new GateWays.Mailjet();
            // await this.sendEmail({
            //     email: "kaitbellahs@gmail.com",
            //     name: "khalid"
            //   }, {
            //     email: "kaitbellahs@gmail.com",
            //     name: "khalid"
            //   }, "Greetings from Mailjet.", "My first Mailjet email", "<h3>Dear passenger 1, welcome to <a href='https://www.mailjet.com/'>Mailjet</a>!</h3><br />May the delivery force be with you!")
            await this.amqp.listenToMessages(RabbitMQ.EMAIL_SEVERITY, this.processMessages.bind(this));
        } catch (error) {
            console.error(error);
        }
    }

    async processMessages(message, channel) {
        try {
            console.log(" [x] %s: message received: '%s'", message.fields.routingKey, message.content.toString('utf8'));
            const messageObject = JSON.parse(message.content.toString('utf8'));
            if (messageObject.method === 'send') {
                for (let i = 1; i < 4; i++) {
                    if (this.sendEmail(messageObject?.object)) {
                        break;
                    }
                    await this.sleep(i * 1000);
                }

            }
        } catch (error) {
            console.error(error);
        } finally {
            channel.ack(message);
        }
    }

    async sendEmail(object) {
        try {
            if (!this.validateObject(object)) {
                console.error("\nobject have not suficiente params\n", object);
                return false;
            }
            const result = await this.provider
                .post("send", {
                    'version': 'v3.1'
                })
                .request({
                    "Messages": [{
                        "From": {
                            "Email": object?.from?.email,
                            "Name": object?.from?.name
                        },
                        "To": [{
                            "Email": object?.to?.email,
                            "Name": object?.to?.name
                        }],
                        "Subject": object?.message?.subject,
                        "HTMLPart": object?.message?.body
                    }]
                });
            if (typeof result === 'boolean' && result) {
                return true;
            }
            console.log(result)
        } catch (exception) {
            console.error(exception);
        }
        return false;
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    validateObject(object) {
        return objHasProp(["from", "to", "message"], object) && objHasProp(["email", "name"], object?.from) && objHasProp(["email", "name"], object?.to) && objHasProp(["subject", "body"], object?.message);
    }
}

await (new EmailWorker).run();