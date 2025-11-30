export const COLUMNS = 3
export const ROWS = 5
export const KEY_COUNT = ROWS * COLUMNS

export const ICON_SIZE = 72

// export function getControlIdFromIndex(index: number): string {
// 	const column = index % COLUMNS
// 	const row = Math.floor(index / COLUMNS)

// 	return getControlIdFromXy(column, row)
// }

export function getControlIdFromXy(column: number, row: number): string {
	return `${row * COLUMNS + column}`
}

const MAP_BUTTON_LIST = [0, 5, 10, 1, 6, 11, 2, 7, 12, 3, 8, 13, 4, 9, 14]
export function mapButton(input: number): number {
	if (input < 0) {
		return -1
	}

	return MAP_BUTTON_LIST[input]
}
