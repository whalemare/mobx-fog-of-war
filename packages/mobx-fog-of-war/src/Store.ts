import {observable, action, autorun} from 'mobx';
import {useEffect} from 'react';
import {argsToKey} from './argsToKey';

export class StoreItem<D,E> {
    @observable loading = false;
    @observable data: D|undefined;
    @observable hasData = false;
    @observable hasError = false;
    @observable error: E|undefined;
    @observable time = new Date(Date.now());

    toPromise = (): Promise<StoreItem<D,E>> => {
        if(!this.loading) return Promise.resolve(this);

        let resolver: (() => void)|undefined;
        const promise = new Promise(resolve => {
            resolver = () => void resolve(this);
        });

        autorun(reaction => {
            if(!this.loading) {
                /* istanbul ignore next */
                resolver?.();
                reaction.dispose();
            }
        });

        return promise as Promise<StoreItem<D,E>>;
    };
}

export interface NextRequest<A> {
    args: A;
    requestId: number;
}

export type Receive<A,D,E> = {
    args: A;
    data: D;
} | {
    args: A;
    error: E;
};

export type Logger = (...args: unknown[]) => unknown;

export interface StoreOptions<A,D,E,AA> {
    name?: string;
    request?: (store: Store<A,D,E,AA>) => void;
    staleTime?: number;
    log?: Logger;
}

export interface GetOptions<AA> {
    staleTime?: number;
    alias?: AA;
}

export interface RequestOptions<AA> {
    alias?: AA;
}

export interface UseGetOptions<AA> {
    staleTime?: number;
    dependencies?: unknown[];
    alias?: AA;
}

// eslint-disable-next-line @typescript-eslint/ban-types
export type NotUndefined = {} | null;

export class Store<A,D extends NotUndefined,E extends NotUndefined,AA=string> {

    name: string;
    staleTime: number;
    log: Logger;

    @observable cache: Map<string, StoreItem<D,E>> = new Map();
    aliases: Map<string, string> = new Map();

    // nextRequest will change each time there is a new request
    // chain off it to go fetch some data
    @observable nextRequest: NextRequest<A>|undefined;
    requestId = 0;

    constructor(options: StoreOptions<A,D,E,AA> = {}) {
        const {
            name = 'unnamed',
            request,
            staleTime = -1,
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            log = () => {}
        } = options;

        this.name = name;
        this.log = log;
        this.staleTime = staleTime;

        if(request) {
            request(this);
        }
    }

    _getOrCreate = (key: string): StoreItem<D,E> => {
        let item = this.cache.get(key);
        if(!item) {
            item = new StoreItem();
            item.time = new Date(Date.now());
            this.cache.set(key, item);
        }
        return item;
    };

    // read()
    //
    // reads an item from cache
    // will NOT go get it from source if it doesnt exist
    //
    // remember that the returned item is a mobx observable
    // so all changes to the item can be observed,
    // or turned into an rxjs observable to be observed that way

    @action
    read = (args: A): StoreItem<D,E> => {
        const key = argsToKey(args);
        return this._getOrCreate(key);
    }

    // readAlias()
    //
    // reads an item from cache via its alias
    // aliases are set by get(), request() or useGet()
    // an alias always refers to a single item in cache at a time
    // although the item being referred to may change

    @action
    readAlias = (args: AA): StoreItem<D,E> => {
        const aliasKey = argsToKey(args);
        const key = this.aliases.get(aliasKey) || '?';
        // ^ if alias not found, a '?' empty storeitem item will be created
        // which will never be updated and is used merely to return from
        // this and any future calls toreadAlias
        return this._getOrCreate(key);
    }

    // get()
    //
    // gets an item, either from cache or by requesting it if required
    // returns the mobx observable for the item

    get = (args: A, options: GetOptions<AA> = {}): StoreItem<D,E> => {
        if('alias' in options) {
            this.setAlias(args, options.alias as AA);
        }

        const item = this.read(args);

        const hasItemExpired = (item: StoreItem<D,E>): boolean => {
            const slateTime: number = typeof options.staleTime === 'number'
                ? options.staleTime
                : this.staleTime;

            if(slateTime === -1) return false;
            if(slateTime === 0) return true;
            return new Date(Date.now()) > new Date(item.time.getTime() + slateTime * 1000);
        };

        if(!item.loading && (!item.hasData || hasItemExpired(item))) {
            return this.request(args);
        }

        return item;
    }

    //
    // actions
    //
    // the act of calling these will cause mobx to update
    // everything thats interested in the whole app
    //

    // request() action
    //
    // make a request for data

    @action
    request = (args: A, options: RequestOptions<AA> = {}): StoreItem<D,E> => {
        if('alias' in options) {
            this.setAlias(args, options.alias as AA);
        }

        const key = argsToKey(args);

        this.log(`${this.name}: requesting ${key}:`, args);

        this.setLoading(args, true);

        this.requestId++;

        // set nextRequest, inserting a new item into the request stream
        this.nextRequest = {
            args,
            requestId: this.requestId
        };

        return this.read(args);
    };

    // receive() action
    //
    // for a given key, set an item in cache
    // basd on if it is data or error

    @action
    receive = (receive: Receive<A,D,E>): void => {
        if('error' in receive) {
            this.setError(receive.args, receive.error);
        } else {
            this.setData(receive.args, receive.data);
        }
    };

    // setLoading() action
    //
    // for a given key, set an item's loading state

    @action
    setLoading = (args: A, loading: boolean): void => {
        const key = argsToKey(args);
        const item = this._getOrCreate(key);
        item.loading = loading;
    };

    // setData() action
    //
    // for a given key, set an item's data in cache

    @action
    setData = (args: A, data: D): void => {
        if(data === undefined) {
            throw new Error('Data cannot be undefined');
        }

        const key = argsToKey(args);
        this.log(`${this.name}: receiving data for ${key}:`, data);

        const item = this._getOrCreate(key);
        item.loading = false;
        item.hasData = data !== undefined;
        item.hasError = false;
        item.error = undefined;
        item.data = data;
    };

    // setError() action
    //
    // for a given key, set an item's data in cache

    @action
    setError = (args: A, error: E): void => {
        if(error === undefined) {
            throw new Error('Error cannot be undefined');
        }

        const key = argsToKey(args);
        this.log(`${this.name}: receiving error for ${key}:`, error);

        const item = this._getOrCreate(key);
        item.loading = false;
        item.hasError = error !== undefined;
        item.error = error;
    };

    // setAlias()
    //
    // set an alias for a set of args

    setAlias = (args: A, alias: AA): void => {
        const key = argsToKey(args);
        const aliasKey = argsToKey(alias);
        this.aliases.set(aliasKey, key);
    };

    // remove() action
    //
    // for a given key, remove the cached item

    @action
    remove = (args: A): void => {
        const key = argsToKey(args);
        this.cache.delete(key);
    };

    // useGet()
    //
    // react hook to get data
    // because React doesn't like side effects during a render
    // call it every render because this'll be deduped upstream anyway

    useGet = (args: A, {dependencies = [], ...restOptions}: UseGetOptions<AA> = {}): StoreItem<D,E>|undefined => {
        const key = argsToKey(args);
        useEffect(() => void this.get(args, restOptions), [key, ...dependencies]);
        return this.read(args);
    };
}
