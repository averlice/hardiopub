import { error, type RequestEvent } from "@sveltejs/kit";
import Subscription from "./database/models/subscription";
import { User } from "./database";

export const subscribe = async (event: RequestEvent): Promise<any> => {
    const user = event.locals.user;
    if (!user) {
        return error(403, "Forbidden");
    }
    
    const subscribedToUser = await User.findByPk(event.params.id);
    if (!subscribedToUser) {
        return error(403, "Forbidden");
    }
        
    if (user.id == subscribedToUser.id) {
        return error(403, "Forbidden");
    }

    try {
        await Subscription.create({ subscriberId: user.id, subscribedToId: subscribedToUser.id });
        return { success: true };
    } catch {
        return error(500, "Internal error");
    }
};

export const unsubscribe = async (event: RequestEvent): Promise<any> => {
    const user = event.locals.user;
    if (!user) {
        return error(403, "Forbidden");
    }
    
    const subscribedToUser = await User.findByPk(event.params.id);
    if (!subscribedToUser) {
        return error(403, "Forbidden");
    }
        
    if (user.id == subscribedToUser.id) {
        return error(403, "Forbidden");
    }

    const deletedCount = await Subscription.destroy({ where: { subscriberId: user.id, subscribedToId: subscribedToUser.id } });

    if (deletedCount > 0) return { success: true }
    else return error(404, "Subscription not found")
};
