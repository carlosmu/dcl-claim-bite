import { setupUi } from './ui'
import { setupMineProximity } from './mining/mine-proximity'
import { setupMusic } from './audio/music'

export function main() {
    setupMusic()
    setupMineProximity()
    setupUi()
}
