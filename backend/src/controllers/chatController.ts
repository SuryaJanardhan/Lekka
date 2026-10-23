import { Request, Response } from 'express';
import { ChatService } from '../services/chatService';

export class ChatController {
  public static async sendMessage(req: Request, res: Response) {
    try {
      const { message, sessionId = 'default_user', clientState, history } = req.body;
      if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ success: false, error: 'A valid message string is required' });
      }

      const result = await ChatService.processChatMessage({
        sessionId,
        userMessage: message.trim(),
        clientState,
        history
      });

      res.json({
        success: true,
        data: {
          reply: result.reply,
          toolUsed: result.toolUsed || null
        }
      });
    } catch (error: any) {
      console.error('[Chat] Request failed', { status: error.status || 500 });
      res.status(error.status >= 400 && error.status <= 599 ? error.status : 500).json({ success: false, error: error.message || 'AI request failed' });
    }
  }

  public static clearHistory(req: Request, res: Response) {
    const { sessionId = 'default_user' } = req.body;
    ChatService.clearSessionHistory(sessionId);
    res.json({ success: true, message: 'Chat history cleared successfully' });
  }
}
