import {
	CardGenerator,
	HostCapabilities,
	SurfaceDrawProps,
	SurfaceContext,
	SurfaceInstance,
	createModuleLogger,
	ModuleLogger,
} from '@companion-surface/base'
import type { HIDAsync } from 'node-hid'
import { COLUMNS, ICON_SIZE, mapButton, ROWS } from './util.js'
import PQueue from 'p-queue'
import { setTimeout } from 'node:timers/promises'

const PAGE_PACKET_SIZE = 8017
const NUM_TOTAL_PIXELS = ICON_SIZE * ICON_SIZE

export class InfinittonWrapper implements SurfaceInstance {
	readonly #logger: ModuleLogger

	readonly #infinitton: HIDAsync

	readonly #surfaceId: string
	readonly #context: SurfaceContext

	public get surfaceId(): string {
		return this.#surfaceId
	}
	public get productName(): string {
		return 'iDisplay Infinitton'
	}

	readonly #drawQueue = new PQueue({ concurrency: 1 })

	public constructor(surfaceId: string, infinitton: HIDAsync, context: SurfaceContext) {
		this.#logger = createModuleLogger(`Instance/${surfaceId}`)
		this.#infinitton = infinitton
		this.#surfaceId = surfaceId
		this.#context = context

		this.#infinitton.on('error', (error) => {
			this.#logger.error(error)
			this.#context.disconnect(error)
		})

		const keyState = new Array(COLUMNS * ROWS).fill(false)

		const keyIsPressed = (keyIndex: number, keyPressed0: number) => {
			const keyPressed = keyPressed0 !== 0
			const stateChanged = keyPressed !== keyState[keyIndex]
			if (stateChanged) {
				keyState[keyIndex] = keyPressed
				if (keyPressed) {
					this.#context.keyDownById(keyIndex + '')
				} else {
					this.#context.keyUpById(keyIndex + '')
				}
			}
		}

		this.#infinitton.on('data', (data: Buffer) => {
			// Col 1
			keyIsPressed(12, data[1] & 0x10)
			keyIsPressed(9, data[1] & 0x08)
			keyIsPressed(6, data[1] & 0x04)
			keyIsPressed(3, data[1] & 0x02)
			keyIsPressed(0, data[1] & 0x01)

			// Col 2
			keyIsPressed(13, data[2] & 0x02)
			keyIsPressed(10, data[2] & 0x01)
			keyIsPressed(7, data[1] & 0x80)
			keyIsPressed(4, data[1] & 0x40)
			keyIsPressed(1, data[1] & 0x20)

			// Col 3
			keyIsPressed(14, data[2] & 0x40)
			keyIsPressed(11, data[2] & 0x20)
			keyIsPressed(8, data[2] & 0x10)
			keyIsPressed(5, data[2] & 0x08)
			keyIsPressed(2, data[2] & 0x04)
		})
	}

	async init(): Promise<void> {
		await this.blank()
	}
	async close(): Promise<void> {
		await this.blank().catch(() => null)

		await this.#infinitton.close().catch(() => null)
	}

	updateCapabilities(_capabilities: HostCapabilities): void {
		// Not used
	}

	async ready(): Promise<void> {
		// Nothing to do
	}

	async setBrightness(percent: number): Promise<void> {
		if (percent < 0 || percent > 100) {
			throw new RangeError('Expected brightness percentage to be between 0 and 100')
		}

		const brightnessCommandBuffer = Buffer.from([0x00, 0x11, percent])
		await this.#infinitton.sendFeatureReport(brightnessCommandBuffer)
	}
	async blank(): Promise<void> {
		const buffer = Buffer.alloc(NUM_TOTAL_PIXELS * 3)

		const keysTotal = COLUMNS * ROWS
		for (let keyIndex = 0; keyIndex < keysTotal; keyIndex++) {
			await this.#writePixelData(keyIndex, buffer)
		}
	}
	async draw(_signal: AbortSignal, drawProps: SurfaceDrawProps): Promise<void> {
		if (!drawProps.image) return

		let key = Number(drawProps.controlId)
		if (isNaN(key)) return

		key = mapButton(key)

		if (key >= 0 && !isNaN(key)) {
			try {
				if (drawProps.image.length !== NUM_TOTAL_PIXELS * 3) {
					throw new RangeError(
						`Expected image buffer of length ${NUM_TOTAL_PIXELS * 3}, got length ${drawProps.image.length}`,
					)
				}

				await this.#fillImageInner(key, drawProps.image)
			} catch (e: any) {
				this.#logger.debug(`scale image failed: ${e}\n${e.stack}`)
				this.#context.disconnect(e)
			}
		}
	}
	async showStatus(_signal: AbortSignal, _cardGenerator: CardGenerator): Promise<void> {
		// Not used
	}

	async #fillImageInner(keyIndex: number, imageBuffer: Uint8Array) {
		const stride = ICON_SIZE * 3
		const byteBuffer = Buffer.alloc(NUM_TOTAL_PIXELS * 3)

		// Convert from RGB to BGR and rotate 90° clockwise for portrait orientation.
		for (let y = 0; y < ICON_SIZE; y++) {
			for (let x = 0; x < ICON_SIZE; x++) {
				const srcOffset = y * stride + x * 3
				const red = imageBuffer[srcOffset]
				const green = imageBuffer[srcOffset + 1]
				const blue = imageBuffer[srcOffset + 2]

				// First flip horizontally, then rotate 90° counter-clockwise.
				const newX = y
				const newY = x
				const targetOffset = (newY * ICON_SIZE + newX) * 3

				byteBuffer.writeUInt8(blue, targetOffset)
				byteBuffer.writeUInt8(green, targetOffset + 1)
				byteBuffer.writeUInt8(red, targetOffset + 2)
			}
		}

		return this.#writePixelData(keyIndex, byteBuffer)
	}

	/**
	 * Writes Infinitton's pixel data to the Infinitton.
	 */
	async #writePixelData(keyIndex: number, pixels: Buffer) {
		await this.#drawQueue.add(async () => {
			const firstPagePixels = pixels.subarray(0, 7946)
			const secondPagePixels = pixels.subarray(7946, NUM_TOTAL_PIXELS * 3)
			await this.#writePage1(keyIndex, firstPagePixels)
			await this.#writePage2(keyIndex, secondPagePixels)

			// HACK: Give the device a chance to flush its buffer before the next write
			// This is probably pretty brittle, but without protocol docs, it is unclear if we can do any better
			await setTimeout(5)

			await this.#infinitton.sendFeatureReport(
				Buffer.from([
					0,
					0x12,
					0x01,
					0x00,
					0x00,
					keyIndex + 1,
					0x00,
					0x00,
					0x00,
					0x00,
					0x00,
					0x00,
					0x00,
					0x00,
					0x00,
					0x00,
					0x00,
					0xf6,
					0x3c,
					0x00,
					0x00,
					0x00,
					0x00,
					0x00,
					0x00,
					0x00,
					0x00,
					0x00,
					0x00,
					0x00,
					0x00,
					0x00,
					0x00,
					0x00,
				]),
			)
		})
	}

	/**
	 * Writes Infinitton's page 1 headers and image data to the Infinitton.
	 */
	async #writePage1(_keyIndex: number, buffer: Buffer) {
		const header = Buffer.from([
			0x02, 0x00, 0x00, 0x00, 0x00, 0x40, 0x1f, 0x00, 0x00, 0x55, 0xaa, 0xaa, 0x55, 0x11, 0x22, 0x33, 0x44, 0x42, 0x4d,
			0xf6, 0x3c, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x36, 0x00, 0x00, 0x00, 0x28, 0x00, 0x00, 0x00, 0x48, 0x00, 0x00,
			0x00, 0x48, 0x00, 0x00, 0x00, 0x01, 0x00, 0x18, 0x00, 0x00, 0x00, 0x00, 0x00, 0xc0, 0x3c, 0x00, 0x00, 0x13, 0x0b,
			0x00, 0x00, 0x13, 0x0b, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
		])

		const packet = Buffer.alloc(PAGE_PACKET_SIZE)
		header.copy(packet, 0)
		buffer.copy(packet, header.length, 0, Math.min(PAGE_PACKET_SIZE - header.length, buffer.length))

		return this.#infinitton.write(packet)
	}

	/**
	 * Writes Infinitton's page 2 headers and image data to the Infinitton.
	 */
	async #writePage2(_keyIndex: number, buffer: Buffer) {
		const header = Buffer.from([
			0x02, 0x40, 0x1f, 0x00, 0x00, 0xb6, 0x1d, 0x00, 0x00, 0x55, 0xaa, 0xaa, 0x55, 0x11, 0x22, 0x33, 0x44,
		])

		const packet = Buffer.alloc(PAGE_PACKET_SIZE)
		header.copy(packet, 0)
		buffer.copy(packet, header.length, 0, Math.min(PAGE_PACKET_SIZE - header.length, buffer.length))

		return this.#infinitton.write(packet)
	}
}
