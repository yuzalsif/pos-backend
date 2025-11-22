import { Controller, Post, Get, Patch, Delete, Body, Param, Query, Req, UseGuards, UnauthorizedException } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { AuthGuard, type RequestWithUser } from '../auth/auth.guard';

@Controller('api/v1/categories')
@UseGuards(AuthGuard)
export class CategoriesController {
    constructor(private readonly categoriesService: CategoriesService) { }

    @Post()
    create(@Body() createCategoryDto: CreateCategoryDto, @Req() req: RequestWithUser) {
        const { tenantId, userId, role } = req.user;

        if (role !== 'owner' && role !== 'manager') {
            throw new UnauthorizedException({ key: 'auth.no_permission' });
        }

        return this.categoriesService.create(tenantId, userId, createCategoryDto);
    }

    @Get()
    list(@Query('type') type: 'income' | 'expense' | undefined, @Req() req: RequestWithUser) {
        const { tenantId } = req.user;
        return this.categoriesService.list(tenantId, type);
    }

    @Get('tree')
    getTree(@Query('type') type: 'income' | 'expense' | undefined, @Req() req: RequestWithUser) {
        const { tenantId } = req.user;
        return this.categoriesService.getCategoryTree(tenantId, type);
    }

    @Get(':id')
    get(@Param('id') id: string, @Req() req: RequestWithUser) {
        const { tenantId } = req.user;
        return this.categoriesService.get(tenantId, id);
    }

    @Get(':id/subcategories')
    getSubcategories(@Param('id') id: string, @Req() req: RequestWithUser) {
        const { tenantId } = req.user;
        return this.categoriesService.getSubcategories(tenantId, id);
    }

    @Patch(':id')
    update(
        @Param('id') id: string,
        @Body() updateCategoryDto: UpdateCategoryDto,
        @Req() req: RequestWithUser
    ) {
        const { tenantId, userId, role } = req.user;

        if (role !== 'owner' && role !== 'manager') {
            throw new UnauthorizedException({ key: 'auth.no_permission' });
        }

        return this.categoriesService.update(tenantId, userId, id, updateCategoryDto);
    }

    @Delete(':id')
    delete(@Param('id') id: string, @Req() req: RequestWithUser) {
        const { tenantId, userId, role } = req.user;

        if (role !== 'owner' && role !== 'manager') {
            throw new UnauthorizedException({ key: 'auth.no_permission' });
        }

        return this.categoriesService.delete(tenantId, userId, id);
    }
}
