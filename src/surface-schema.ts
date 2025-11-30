import type { SurfaceSchemaLayoutDefinition } from '@companion-surface/base'
import { COLUMNS, getControlIdFromXy, ICON_SIZE, ROWS } from './util.js'

export function createSurfaceSchema(): SurfaceSchemaLayoutDefinition {
	const surfaceLayout: SurfaceSchemaLayoutDefinition = {
		stylePresets: {
			default: {
				bitmap: {
					w: ICON_SIZE,
					h: ICON_SIZE,
					format: 'rgb', // Future: this could be rgb?
				},
			},
		},
		controls: {},
	}

	for (let y = 0; y < ROWS; y++) {
		for (let x = 0; x < COLUMNS; x++) {
			surfaceLayout.controls[getControlIdFromXy(x, y)] = {
				row: y,
				column: x,
			}
		}
	}

	return surfaceLayout
}
