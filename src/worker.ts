import { Domain, GateWays, objHasProp, Types, Utils } from '@ikomida/shared-backend'
import { Message, Channel } from 'amqplib'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
let { name } = require('../package.json')
name = name
  .replace(/^(@\S+\/)?(svelte-)?(\S+)/, '$3')
  .replace(/^\w/, (m: string) => m.toUpperCase())
  .replace(/-\w/g, (m: string[]) => m[1].toUpperCase())

class EmailWorker {
  amqp?: Domain.RabbitMQ
  provider?: GateWays.Mailjet
  logger: Utils.Logger

  constructor() {
    this.logger = Utils.Logger.getInstance(name)
  }

  async run() {
    try {
      this.amqp = new Domain.RabbitMQ(this.logger)
      this.provider = new GateWays.Mailjet(this.logger)
      await this.amqp.listenToMessages(Domain.RabbitMQ.EMAIL_QUEUE, this.processMessages.bind(this))
    } catch (error: any) {
      this.logger.error(error)
    }
  }

  async processMessages(message: Message, channel: Channel) {
    try {
      this.logger.log(` [x] ${message.fields.routingKey}: message received: '${message.content.toString('utf8')}'`)
      const messageObject: Types.Classes.CAMQPPayload<Types.Classes.CEmail> = Types.Classes.CAMQPPayload.fromObject(
        JSON.parse(message.content.toString('utf8') ?? '{}')
      )
      if (messageObject?.method === 'send') {
        let n = 0
        const startTime = new Date().getTime()
        let i = 0
        const payload = Types.Classes.CEmail.fromObject(messageObject?.object)
        for (i = 1; i <= 5; i++) {
          if (await this.sendEmail(payload)) {
            this.logger.log(` [x] Email enviado com sucesso`)
            channel.ack(message)
            return true
          }
          n += i
          await Utils.System.sleep(n * 4000)
        }
        this.logger.error(
          `[x] o email não foi enviado após ${i} tentativas em ${(startTime - new Date().getTime()) / 1000}s.`
        )
        channel.ack(message)
      } else {
        this.logger.log(` [x] metodo: ${messageObject?.method} não suportado!`)
        channel.ack(message)
        return false
      }
    } catch (error: any) {
      this.logger.error(error)
    }
    channel.nack(message)
    return false
  }

  async sendEmail(object: Types.Classes.CEmail) {
    try {
      if (!object.validate() || !this.validateObject(object.toJSON())) {
        this.logger.error('\nobject have not suficiente params\n', object.toJSON())
        return false
      }
      const result = await this.provider?.send(object.toJSON())
      if (typeof result === 'boolean' && result) {
        return true
      }
    } catch (exception) {
      this.logger.error(exception)
    }
    return false
  }

  validateObject(object: any) {
    return (
      objHasProp(['from', 'to', 'message'], object) &&
      objHasProp(['email', 'name'], object?.from) &&
      objHasProp(['email', 'name'], object?.to) &&
      objHasProp(['subject', 'body'], object?.message)
    )
  }
}

await new EmailWorker().run()
