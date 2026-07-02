/**
 * WebSocket Module
 */
import { Module } from '@nestjs/common';
import { WritingGateway, SystemGateway } from './websocket.gateway';

@Module({
  providers: [WritingGateway, SystemGateway],
  exports: [WritingGateway, SystemGateway],
})
export class WebSocketModule {}
