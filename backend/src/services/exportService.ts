import { EmailModel } from '../models/Email.js';
import { CategoryModel } from '../models/Category.js';
import { RuleModel } from '../models/Rule.js';

export interface LLMExportBundle {
  exportMetadata: {
    generatedAt: string;
    systemVersion: string;
    totalEmailsExported: number;
  };
  categories: any[];
  rules: any[];
  emailRecords: any[];
}

export class ExportService {
  public static async generateLLMContextBundle(): Promise<LLMExportBundle> {
    const categories = await CategoryModel.find({}).lean();
    const rules = await RuleModel.find({}).lean();
    const emails = await EmailModel.find({}).populate('categoryId').sort({ receivedAt: -1 }).lean();

    const formattedEmails = emails.map((email: any) => ({
      id: email._id,
      messageId: email.messageId,
      sender: email.sender,
      subject: email.subject,
      parsedContent: email.parsedJson,
      ocrExtractedText: email.ocrExtractedText || null,
      assignedCategory: email.categoryId ? email.categoryId.name : 'Unassigned',
      categorizationSource: email.categorySource,
      aiConfidenceScore: email.aiConfidenceScore,
      userReviewStatus: email.reviewStatus,
      receivedTimestamp: email.receivedAt,
      ingestedTimestamp: email.processedAt
    }));

    return {
      exportMetadata: {
        generatedAt: new Date().toISOString(),
        systemVersion: '1.0.0',
        totalEmailsExported: formattedEmails.length
      },
      categories,
      rules,
      emailRecords: formattedEmails
    };
  }
}
