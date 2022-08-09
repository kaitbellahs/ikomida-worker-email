#!/usr/bin/env node

import {
    objHasProp,
    RabbitMQ,
    GateWays,
    Logger,
    System
} from 'ikomida-shared';
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
            await this.amqp.listenToMessages(RabbitMQ.EMAIL_QUEUE, this.processMessages.bind(this))
        } catch (error) {
            this.logger.error(error)
        }
    }

    async processMessages(message, channel) {
        try {
            this.logger.log(` [x] ${message.fields.routingKey}: message received: '${message.content.toString('utf8')}'`)
            const messageObject = JSON.parse(message.content.toString('utf8'))
            if (messageObject?.method === 'send') {
                for (let i = 1; i < 4; i++) {
                    if (await this.sendEmail(messageObject?.object)) {
                        this.logger.log(` [x] Email enviado com sucesso`)
                        channel.ack(message)
                        return true
                    }
                    await System.sleep(i * 1000)
                }

                this.logger.log(` [x] o email não foi enviado apos ${i} tentativas!`)
            } else {
                this.logger.log(` [x] metodo: ${messageObject?.method} não suportado!`)
            }
        } catch (error) {
            this.logger.error(error)
        }
        return false
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

    validateObject(object) {
        return objHasProp(["from", "to", "message"], object) && objHasProp(["email", "name"], object?.from) && objHasProp(["email", "name"], object?.to) && objHasProp(["subject", "body"], object?.message)
    }
}

await (new EmailWorker).run()