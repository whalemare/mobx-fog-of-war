import {Load, StoreItem, getPriority} from '../src/index';
import React from 'react';
import Enzyme, {shallow} from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';

Enzyme.configure({
    adapter: new Adapter()
});

const empty = new StoreItem<number,string>();

const loading = new StoreItem<number,string>();
loading.loading = true;

const error = new StoreItem<number,string>();
error.hasError = true;
error.error = 'error!';

const data = new StoreItem<number,string>();
data.hasData = true;
data.data = 123;

type LoadingProps = {
    storeItems: [StoreItem<number,string>];
};

type ErrorProps = {
    storeItems: [StoreItem<number,string>];
    errors: [string?];
};

type ErrorProps3 = {
    storeItems: [StoreItem<number,string>,StoreItem<number,string>,StoreItem<number,string>];
    errors: [string?,string?,string?];
};

describe('getPriority', () => {

    it('should return correct priorities', () => {
        expect(getPriority([loading, error, data, empty], 'led')).toBe('l');
        expect(getPriority([error, data, empty], 'led')).toBe('e');
        expect(getPriority([data, empty], 'led')).toBe('d');
        expect(getPriority([empty], 'led')).toBe('n');
        expect(getPriority([empty], 'ledf')).toBe('d');
    });

    it('should return correct priorities for everys', () => {
        expect(getPriority([loading, loading, loading], 'L')).toBe('l');
        expect(getPriority([loading, loading, loading, empty], 'L')).toBe('n');

        expect(getPriority([error, error, error], 'E')).toBe('e');
        expect(getPriority([error, error, error, empty], 'E')).toBe('n');

        expect(getPriority([data, data, data], 'D')).toBe('d');
        expect(getPriority([data, data, data, empty], 'D')).toBe('n');
    });

    it('should return correct priorities using ternaries', () => {
        expect(getPriority([loading, error], 'e?le:Dl')).toBe('l');
        expect(getPriority([error], 'e?le:Dl')).toBe('e');
        expect(getPriority([data], 'e?le:Dl')).toBe('d');
        expect(getPriority([data, loading], 'e?le:Dl')).toBe('l');
        expect(getPriority([loading], 'e?le:Dl')).toBe('l');
        expect(getPriority([empty], 'e?le:Dl')).toBe('n');
    });

    it('should error if given incorrect priority', () => {
        expect(() => getPriority([empty], 'ledQ')).toThrow('Invalid priority');
    });

});

describe('Load', () => {

    describe('in empty state', () => {

        it('should render default empty (nothing)', () => {
            const wrapper = shallow(<Load storeItems={[empty]}>{() => <div />}</Load>);
            expect(wrapper.type()).toBe(null);
        });

    });

    describe('in loading state', () => {

        it('should render default loading (nothing)', () => {
            const wrapper = shallow(<Load storeItems={[loading]}>{() => <div />}</Load>);
            expect(wrapper.type()).toBe(null);
        });

        it('should render loading element', () => {
            const wrapper = shallow(<Load storeItems={[loading]} loading={<p />}>{() => <div />}</Load>);
            expect(wrapper.type()).toBe('p');
        });

        it('should render loading component', () => {
            const Loading = jest.fn((_props: LoadingProps) => <div>loading</div>);

            const wrapper = shallow(<Load storeItems={[loading]} loadingComponent={Loading} boo>{() => <div />}</Load>);

            expect(wrapper.html()).toBe('<div>loading</div>');
            expect(Loading).toHaveBeenCalledTimes(1);
            expect(Loading.mock.calls[0][0]).toEqual({
                storeItems: [loading],
                boo: true
            });
        });

    });

    describe('in error state', () => {

        it('should render default error (nothing)', () => {
            const wrapper = shallow(<Load storeItems={[error]}>{() => <div />}</Load>);

            expect(wrapper.type()).toBe(null);
        });

        it('should render error element', () => {
            const wrapper = shallow(<Load storeItems={[error]} error={<p />}>{() => <div />}</Load>);

            expect(wrapper.type()).toBe('p');
        });

        it('should render error component', () => {
            const ErrorComponent = jest.fn((_props: ErrorProps) => <div>error</div>);

            const wrapper = shallow(<Load storeItems={[error]} errorComponent={ErrorComponent} boo>{() => <div />}</Load>);

            expect(wrapper.html()).toBe('<div>error</div>');
            expect(ErrorComponent).toHaveBeenCalledTimes(1);
            expect(ErrorComponent.mock.calls[0][0]).toEqual({
                storeItems: [error],
                errors: ['error!'],
                boo: true
            });
        });

        it('should render error component with multiple', () => {
            const ErrorComponent = jest.fn((_props: ErrorProps3) => <div>error</div>);

            const wrapper = shallow(<Load storeItems={[error, error, loading]} priorities="e" errorComponent={ErrorComponent}>{() => <div />}</Load>);

            expect(wrapper.html()).toBe('<div>error</div>');
            expect(ErrorComponent).toHaveBeenCalledTimes(1);
            expect(ErrorComponent.mock.calls[0][0]).toEqual({
                storeItems: [error, error, loading],
                errors: ['error!', 'error!']
            });
        });

    });

    describe('in data state', () => {

        it('should render data', () => {
            const children = jest.fn((_data: [number|undefined], _rest: {[key: string]: unknown}) => <div>data</div>);

            const wrapper = shallow(<Load storeItems={[data]} foo>{children}</Load>);
            expect(wrapper.html()).toBe('<div>data</div>');
            expect(children).toHaveBeenCalledTimes(1);
            expect(children.mock.calls[0][0]).toEqual([123]);
            expect(children.mock.calls[0][1]).toEqual({foo: true});
        });

        it('should render data with multiple', () => {

            const data1 = new StoreItem<{foo: number},string>();
            data1.hasData = true;
            data1.data = {foo: 123};

            const data2 = new StoreItem<{bar: number},string>();
            data2.hasData = true;
            data2.data = {bar: 456};

            const children = jest.fn((_data: [{foo: number}|undefined, {bar: number}|undefined]) => <div>data</div>);

            const wrapper = shallow(<Load storeItems={[data1, data2]} priorities="d">{children}</Load>);
            expect(wrapper.html()).toBe('<div>data</div>');

            expect(children).toHaveBeenCalledTimes(1);
            expect(children.mock.calls[0][0]).toEqual([{foo: 123}, {bar: 456}]);
        });

        it('should render data with multiple from array', () => {

            const items: StoreItem<number,string>[] = [data, data];

            const children = jest.fn((_data: (number|undefined)[]) => <div>data</div>);

            const wrapper = shallow(<Load storeItems={items} priorities="d">{children}</Load>);
            expect(wrapper.html()).toBe('<div>data</div>');

            expect(children).toHaveBeenCalledTimes(1);
            expect(children.mock.calls[0][0]).toEqual([123, 123]);
        });
    });
});
