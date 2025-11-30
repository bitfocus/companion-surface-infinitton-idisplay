import {
	createModuleLogger,
	type DiscoveredSurfaceInfo,
	type HIDDevice,
	type OpenSurfaceResult,
	type SurfaceContext,
	type SurfacePlugin,
} from '@companion-surface/base'
import { InfinittonWrapper } from './instance.js'
import { createSurfaceSchema } from './surface-schema.js'
import { getControlIdFromXy } from './util.js'
import { HIDAsync } from 'node-hid'

const logger = createModuleLogger('Plugin')

const InfinittonPlugin: SurfacePlugin<HIDDevice> = {
	init: async (): Promise<void> => {
		// Not used
	},
	destroy: async (): Promise<void> => {
		// Not used
	},

	checkSupportsHidDevice: (device: HIDDevice): DiscoveredSurfaceInfo<HIDDevice> | null => {
		if (device.vendorId !== 0xffff || (device.productId !== 0x1f40 && device.productId !== 0x1f41)) return null

		logger.debug(`Checked HID device: ${device.manufacturer} ${device.product}`)

		return {
			surfaceId: `infinitton:${device.serialNumber}`,
			description: 'Infinitton iDisplay',
			pluginInfo: device,
		}
	},

	openSurface: async (
		surfaceId: string,
		pluginInfo: HIDDevice,
		context: SurfaceContext,
	): Promise<OpenSurfaceResult> => {
		const device = await HIDAsync.open(pluginInfo.path).catch(() => {
			throw new Error('Device not found')
		})
		logger.debug(`Opening ${pluginInfo.manufacturer} ${pluginInfo.product} (${surfaceId})`)

		return {
			surface: new InfinittonWrapper(surfaceId, device, context),
			registerProps: {
				brightness: true,
				surfaceLayout: createSurfaceSchema(),
				pincodeMap: {
					type: 'single-page',
					pincode: getControlIdFromXy(0, 1),
					0: getControlIdFromXy(4, 1),
					1: getControlIdFromXy(1, 2),
					2: getControlIdFromXy(2, 2),
					3: getControlIdFromXy(3, 2),
					4: getControlIdFromXy(1, 1),
					5: getControlIdFromXy(2, 1),
					6: getControlIdFromXy(3, 1),
					7: getControlIdFromXy(1, 0),
					8: getControlIdFromXy(2, 0),
					9: getControlIdFromXy(3, 0),
				},
				configFields: null,
				location: null,
			},
		}
	},
}
export default InfinittonPlugin
