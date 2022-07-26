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
    import.meta.url)
let {
    name
} = require("../package.json")
name = name
    .replace(/^(@\S+\/)?(svelte-)?(\S+)/, '$3')
    .replace(/^\w/, m => m.toUpperCase())
    .replace(/-\w/g, m => m[1].toUpperCase())

class EmailWorker {

    googleAdmin;
    amqp;
    provider;
    logger

    constructor() {
        this.logger = Logger.getInstance(name, process.env?.ENV !== 'PROD')
    }

    async run() {
        try {
            this.amqp = new RabbitMQ(this.logger)
            this.provider = new GateWays.Mailjet(this.logger)
            // await this.sendEmail({
            //     email: "kaitbellahs@gmail.com",
            //     name: "khalid"
            //   }, {
            //     email: "kaitbellahs@gmail.com",
            //     name: "khalid"
            //   }, "Greetings from Mailjet.", "My first Mailjet email", "<h3>Dear passenger 1, welcome to <a href='https://www.mailjet.com/'>Mailjet</a>!</h3><br />May the delivery force be with you!")
            await this.amqp.listenToMessages(RabbitMQ.EMAIL_SEVERITY, this.processMessages.bind(this))
        } catch (error) {
            this.logger.error(error)
        }
    }

    async processMessages(message, channel) {
        try {
            this.logger.log(` [x] ${message.fields.routingKey}: message received: '${message.content.toString('utf8')}'`)
            const messageObject = JSON.parse(message.content.toString('utf8'))
            if (messageObject.method === 'send') {
                for (let i = 1; i < 4; i++) {
                    if (this.sendEmail(messageObject?.object)) {
                        break;
                    }
                    await this.sleep(i * 1000)
                }
            }
        } catch (error) {
            this.logger.error(error)
        } finally {
            channel.ack(message)
        }
    }

    async sendEmail(object) {
        try {
            if (!this.validateObject(object)) {
                this.logger.error("\nobject have not suficiente params\n", object)
                return false;
            }
            const result = await this.provider
                .send(object)
            if (typeof result === 'boolean' && result) {
                return true;
            }
        } catch (exception) {
            this.logger.error(exception)
        }
        return false;
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms))
    }

    validateObject(object) {
        return objHasProp(["from", "to", "message"], object) && objHasProp(["email", "name"], object?.from) && objHasProp(["email", "name"], object?.to) && objHasProp(["subject", "body"], object?.message)
    }
}

await (new EmailWorker).run()